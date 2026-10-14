// lib/admin/lifecycle-policy.ts
// Sumber tunggal untuk keputusan lifecycle data admin.
//
//Modul ini SENGAJA bebas dari import Google Sheets / Next.js supaya bisa diuji
// tanpa runtime eksternal. Route `DELETE` memakainya untuk deciding apakah
// penghapusan permanen boleh dilanjutkan; daftar endpoint memakai helper yang
//sama untuk menentukan `canDelete`.
//
// Prinsip: KALAU TIDAK BISA DIVERIFIKASI, TOLAK (fail closed). Google Sheets
// tidak punya foreign key/transaksi, jadi pembacaan yang gagal tidak boleh
//dianggap "tidak ada dependensi".

// ============================================================
// Arsip (nonaktif) vs data kerja
// ============================================================

export interface Archiveable {
  isActive: boolean;
}

/** Pisahkan data kerja (aktif) dari arsip (nonaktif). */
export function splitByArchive<T extends Archiveable>(
  items: readonly T[]
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const item of items) {
    (item.isActive ? active : archived).push(item);
  }
  return { active, archived };
}

/** Pencarian arsip: query kosong berarti tidak ada penyaring. */
export function matchesArchiveQuery(
  query: string,
  ...fields: (string | number | boolean | null | undefined)[]
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((field) =>
    String(field ?? '')
      .toLowerCase()
      .includes(needle)
  );
}

/**
 * Tampilan daftar untuk halaman admin: mode aktif menampilkan yang aktif,
 * mode arsip menampilkan yang nonaktif (dengan pencarian bila ada).
 */
export function filterArchiveView<T extends Archiveable>(
  items: readonly T[],
  options: {
    showArchived: boolean;
    query?: string;
    /** Nilai yang dicari di sisi item, sudah dinormalisasi ke string. */
    searchFields?: (item: T) => (string | number | boolean | null | undefined)[];
  }
): T[] {
  const { active, archived } = splitByArchive(items);
  const source = options.showArchived ? archived : active;
  if (!options.showArchived || !options.query) return source;
  const searchFields = options.searchFields ?? ((item: T) => [item.isActive]);
  return source.filter((item) =>
    matchesArchiveQuery(options.query ?? '', ...searchFields(item))
  );
}

// ============================================================
// Keputusan hapus permanen
// ============================================================

/** Entitas konfigurasi yang boleh dihapus permanen setelah diarsipkan. */
export type ConfigEntity =
  | 'shift'
  | 'sop_category'
  | 'checklist_point'
  | 'handover_field'
  | 'incident_category';

/** Entitas yang hanya boleh diarsipkan selamanya (BR-40 / ADM-AC-04). */
export type ArchiveOnlyEntity = 'branch' | 'user';

export type DeletableEntity = ConfigEntity | ArchiveOnlyEntity;

export interface DeletionFacts {
  /** Status arsip terkini. `undefined` berarti tidak diketahui. */
  isActive?: boolean;
  /**
   * Apakah induk (branch → shift → kategori) berhasil diverifikasi pada
   * request ini. `false` berarti pemeriksaan gagal → tolak.
   */
  parentVerified?: boolean;
  /** Sudah pernah dipakai shift instance historis. */
  hasShiftHistory?: boolean;
  /** Masih punya konfigurasi turunan. */
  hasChildren?: boolean;
  /** Masih direferensikan entry / entry log historis. */
  hasEntryRefs?: boolean;
  /** Masih direferensikan incident. */
  inUse?: boolean;
}

export interface DeletionDecision {
  allowed: boolean;
  status: number;
  message: string;
  /** Alasan singkat untuk log/testing. */
  reason:
    | 'archive_only'
    | 'not_archived'
    | 'parent_unverified'
    | 'has_shift_history'
    | 'has_children'
    | 'has_entry_refs'
    | 'in_use'
    | 'ok';
}

const OK: DeletionDecision = {
  allowed: true,
  status: 200,
  message: '',
  reason: 'ok',
};

const ARCHIVE_ONLY_MESSAGES: Record<ArchiveOnlyEntity, string> = {
  branch:
    'Cabang hanya dapat diarsipkan/nonaktifkan. Data cabang dan spreadsheet dipertahankan untuk menjaga riwayat.',
  user: 'Akun hanya dapat dinonaktifkan. Identitas akun dipertahankan untuk menjaga attribution pada riwayat.',
};

const NOT_ARCHIVED_MESSAGES: Record<ConfigEntity, string> = {
  shift: 'Arsipkan definisi shift terlebih dahulu sebelum menghapus permanen.',
  sop_category: 'Arsipkan kategori SOP terlebih dahulu sebelum menghapus permanen.',
  checklist_point: 'Arsipkan item checklist terlebih dahulu sebelum menghapus permanen.',
  handover_field: 'Arsipkan bidang handover terlebih dahulu sebelum menghapus permanen.',
  incident_category: 'Arsipkan kategori incident terlebih dahulu sebelum menghapus permanen.',
};

const PARENT_UNVERIFIED_MESSAGES: Partial<Record<ConfigEntity, string>> = {
  checklist_point: 'Induk kategori point tidak dapat diverifikasi; penghapusan ditolak.',
  handover_field: 'Induk definisi shift tidak dapat diverifikasi; penghapusan ditolak.',
};

const SHIFT_HISTORY_MESSAGES: Partial<Record<ConfigEntity, string>> = {
  shift:
    'Definisi shift sudah dipakai oleh shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
  sop_category:
    'Kategori sudah terpotret pada shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
  checklist_point:
    'Point berada pada shift yang sudah punya shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
  handover_field:
    'Bidang handover sudah dipakai shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
};

const IN_USE_MESSAGE = 'Kategori sudah dipakai incident sehingga tidak bisa dihapus. Nonaktifkan saja.';

/**
 * Satu-satunya tempat yang memutuskan boleh/tidaknya penghapusan permanen.
 * Selalu mengembalikan `{ allowed: false }` bila ada ketidakpastian.
 */
export function decidePermanentDelete(
  entity: DeletableEntity,
  facts: DeletionFacts = {}
): DeletionDecision {
  if (entity === 'branch' || entity === 'user') {
    return { allowed: false, status: 409, message: ARCHIVE_ONLY_MESSAGES[entity], reason: 'archive_only' };
  }

  // Status tidak diketahui = tidak aman untuk dihapus.
  if (facts.isActive !== false) {
    return {
      allowed: false,
      status: 409,
      message: NOT_ARCHIVED_MESSAGES[entity],
      reason: 'not_archived',
    };
  }

  // Induk gagal diverifikasi → fail closed.
  if (facts.parentVerified === false) {
    return {
      allowed: false,
      status: 409,
      message: PARENT_UNVERIFIED_MESSAGES[entity] ?? 'Induk objek tidak dapat diverifikasi; penghapusan ditolak.',
      reason: 'parent_unverified',
    };
  }

  if (facts.hasShiftHistory) {
    return {
      allowed: false,
      status: 409,
      message:
        SHIFT_HISTORY_MESSAGES[entity] ??
        'Objek sudah dipakai shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
      reason: 'has_shift_history',
    };
  }

  if (entity === 'sop_category' && facts.hasChildren) {
    return {
      allowed: false,
      status: 409,
      message: 'Kategori masih memiliki checklist point. Hapus atau pindahkan pointnya dulu.',
      reason: 'has_children',
    };
  }

  if (entity === 'shift' && facts.hasChildren) {
    return {
      allowed: false,
      status: 409,
      message: 'Hapus atau pindahkan dulu kategori SOP dan bidang handover milik definisi shift ini.',
      reason: 'has_children',
    };
  }

  if (entity === 'checklist_point' && facts.hasEntryRefs) {
    return {
      allowed: false,
      status: 409,
      message: 'Point masih direferensikan oleh entry atau log historis dan tidak bisa dihapus.',
      reason: 'has_entry_refs',
    };
  }

  if (entity === 'incident_category' && facts.inUse) {
    return { allowed: false, status: 409, message: IN_USE_MESSAGE, reason: 'in_use' };
  }

  return OK;
}

/**
 * Kelayakan hapus untuk ditampilkan di UI. Sengaja konservatif: tanpa data
 * histori → belum tentu layak, jadi UI menampilkan tombol dan server yang
 * memutuskan.
 */
export function canDeleteConfig(entity: ConfigEntity, facts: DeletionFacts): boolean {
  return decidePermanentDelete(entity, facts).allowed;
}

/** Kelayakan untuk UI sekaligus alasan singkat saat objek tidak bisa dihapus. */
export function deletionBlockReason(
  entity: ConfigEntity,
  facts: DeletionFacts
): DeletionDecision['reason'] {
  return decidePermanentDelete(entity, facts).reason;
}