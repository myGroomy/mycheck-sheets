// lib/incidents.ts
// Helper bersama untuk Phase 4: pencarian incident lintas cabang,
// peta nama kategori/pengguna, dan fan-out notifikasi.
// Seluruh akses data memakai lib/store.ts (Google Sheets), bukan Drizzle.

import { ulid } from 'ulid';
import type { AuthContext } from './api-auth';
import { getCabangList, resolveCabang } from './google/registry';
import { listAllUsers } from './google/registry-admin';
import {
  asBool,
  asNum,
  asStr,
  ensureMonthlySheet,
  filterRows,
  insertRow,
  listMonthlyRows,
} from './store';

export interface LocatedIncident {
  spreadsheetId: string;
  branchId: string;
  tabMonth: string;
  incident: Record<string, unknown>;
  rowNumber: number | null;
}

/** Bulan kandidat untuk pencarian incident: berjalan + 2 bulan sebelumnya. */
export function candidateMonths(): string[] {
  const out: string[] = [];
  for (let back = 0; back < 3; back++) {
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Tab bulan incident: kolom tab_month, lalu occurred_at, lalu bulan berjalan. */
export function incidentTabMonth(row: Record<string, unknown>): string {
  const direct = asStr(row['tab_month']).trim();
  if (/^\d{4}-\d{2}$/.test(direct)) return direct;
  const occurred = asStr(row['occurred_at']).trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(occurred)) return occurred;
  return new Date().toISOString().slice(0, 7);
}

/**
 * Cari satu incident berdasarkan ID di semua cabang yang bisa diakses user.
 * Jalur cepat via sheet statis IncidentIndex, fallback ke tab bulanan
 * Incidents_<YYYY-MM> (3 bulan terakhir) untuk baris yang belum terindeks.
 */
export async function findIncidentAcrossBranches(
  ctx: AuthContext,
  incidentId: string
): Promise<LocatedIncident | null> {
  const cabangs = await getCabangList();
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }

    // 1. Via IncidentIndex
    try {
      const hits = await filterRows(
        spreadsheetId,
        'IncidentIndex',
        (r) => asStr(r['incident_id']) === incidentId
      );
      const idx = hits[0];
      if (idx) {
        const tabMonth = asStr(idx['tab_month']) || new Date().toISOString().slice(0, 7);
        const rows = await listMonthlyRows(spreadsheetId, 'Incidents', tabMonth);
        const found = rows.find((r) => asStr(r['id']) === incidentId);
        if (found) {
          return { spreadsheetId, branchId: cabang.Cabang_ID, tabMonth, incident: found, rowNumber: null };
        }
      }
    } catch {
      // sheet index belum ada — lanjut ke fallback
    }

    // 2. Fallback: scan tab bulanan
    for (const month of candidateMonths()) {
      const rows = await listMonthlyRows(spreadsheetId, 'Incidents', month);
      const incident = rows.find((r) => asStr(r['id']) === incidentId);
      if (incident) {
        return { spreadsheetId, branchId: cabang.Cabang_ID, tabMonth: month, incident, rowNumber: null };
      }
    }
  }
  return null;
}
/** Nomor baris fisik (1-based) sebuah incident pada tab bulanannya. */
export async function incidentRowNumber(
  spreadsheetId: string,
  tabMonth: string,
  incidentId: string
): Promise<number | null> {
  const { listRowsWithNumber } = await import('./store');
  const { monthlySheet } = await import('./google/branch-schema');
  try {
    const rows = await listRowsWithNumber(spreadsheetId, monthlySheet('Incidents', tabMonth));
    const hit = rows.find((r) => asStr(r.data['id']) === incidentId);
    return hit ? hit.rowNumber : null;
  } catch {
    return null;
  }
}

/** Perbarui kolom terpilih pada baris incident + sinkronkan IncidentIndex. */
export async function updateIncidentRow(
  spreadsheetId: string,
  tabMonth: string,
  incidentId: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  const { listRowsWithNumber, updateRow } = await import('./store');
  const { monthlySheet } = await import('./google/branch-schema');
  const rowNumber = await incidentRowNumber(spreadsheetId, tabMonth, incidentId);
  if (!rowNumber) return false;
  await updateRow(spreadsheetId, monthlySheet('Incidents', tabMonth), rowNumber, updates);
  if (updates['status'] !== undefined) {
    try {
      const numbered = await listRowsWithNumber(spreadsheetId, 'IncidentIndex');
      const hit = numbered.find((r) => asStr(r.data['incident_id']) === incidentId);
      if (hit) {
        await updateRow(spreadsheetId, 'IncidentIndex', hit.rowNumber, {
          status: updates['status'],
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      // index boleh tidak ada — abaikan
    }
  }
  return true;
}

/** Peta Username -> Nama dari Registry.Users (satu panggilan untuk banyak lookup). */
export async function userNameMap(): Promise<Map<string, string>> {
  try {
    const users = await listAllUsers();
    return new Map(users.map((u) => [u.Username, u.Nama]));
  } catch {
    return new Map();
  }
}

/** Peta id kategori -> nama, digabung dari semua cabang yang bisa diakses. */
export async function categoryNameMap(ctx: AuthContext): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const cabangs = await getCabangList();
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    try {
      const { spreadsheetId } = await resolveCabang(cabang.Cabang_ID);
      const rows = await filterRows(spreadsheetId, 'IncidentCategories', () => true);
      for (const r of rows) map.set(asStr(r['id']), asStr(r['name']));
    } catch {
      // sheet belum ada di cabang ini — lanjut
    }
  }
  return map;
}
/** Daftar kategori aktif lintas cabang (dedup berdasarkan nama). */
export async function listActiveCategoriesAcrossBranches(
  ctx: AuthContext
): Promise<{ id: string; name: string; sortOrder: number }[]> {
  const seen = new Map<string, { id: string; name: string; sortOrder: number }>();
  const cabangs = await getCabangList();
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    try {
      const { spreadsheetId } = await resolveCabang(cabang.Cabang_ID);
      const rows = await filterRows(spreadsheetId, 'IncidentCategories', (r) => asBool(r['is_active']));
      for (const r of rows) {
        const name = asStr(r['name']);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.set(name.toLowerCase(), {
          id: asStr(r['id']),
          name,
          sortOrder: asNum(r['sort_order']) ?? 0,
        });
      }
    } catch {
      // lanjut
    }
  }
  return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Cek apakah kategori dipakai oleh incident mana pun (untuk guard hapus). */
export async function isCategoryInUse(
  ctx: AuthContext,
  categoryId: string
): Promise<boolean> {
  const cabangs = await getCabangList();
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }
    try {
      const hits = await filterRows(
        spreadsheetId,
        'IncidentIndex',
        (r) => asStr(r['category_id']) === categoryId
      );
      if (hits.length > 0) return true;
    } catch {
      // abaikan, cek tab bulanan
    }
    for (const month of candidateMonths()) {
      const rows = await listMonthlyRows(spreadsheetId, 'Incidents', month);
      if (rows.some((r) => asStr(r['category_id']) === categoryId)) return true;
    }
  }
  return false;
}
export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

/**
 * Fan-out notifikasi ke sheet statis Notifications pada spreadsheet cabang.
 * Kegagalan tulis tidak boleh menggagalkan transaksi utama — caller
 * menangkap error sendiri bila perlu.
 */
export async function pushNotification(
  spreadsheetId: string,
  input: NotifyInput
): Promise<void> {
  const { ensureSheet } = await import('./google/sheets');
  const { STATIC_SHEETS } = await import('./google/branch-schema');
  try {
    await ensureSheet(spreadsheetId, 'Notifications', STATIC_SHEETS['Notifications']);
  } catch {
    // lanjut coba insert
  }
  const now = new Date().toISOString();
  await insertRow(spreadsheetId, 'Notifications', {
    id: ulid(),
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? '',
    is_read: false,
    created_at: now,
  });
}

/**
 * Tulis/sinkronkan satu baris IncidentIndex untuk incident.
 * Dipakai saat create & status change agar daftar cepat tetap akurat.
 */
export async function upsertIncidentIndex(
  spreadsheetId: string,
  entry: {
    incident_id: string;
    tab_month: string;
    status: string;
    category_id: string;
    shift_instance_id: string;
    outside_shift: boolean;
    reported_at: string;
    is_test?: boolean;
  }
): Promise<void> {
  const { ensureSheet } = await import('./google/sheets');
  const { STATIC_SHEETS } = await import('./google/branch-schema');
  const { listRowsWithNumber, updateRow } = await import('./store');
  try {
    await ensureSheet(spreadsheetId, 'IncidentIndex', STATIC_SHEETS['IncidentIndex']);
  } catch {
    // lanjut
  }
  try {
    const numbered = await listRowsWithNumber(spreadsheetId, 'IncidentIndex');
    const hit = numbered.find((r) => asStr(r.data['incident_id']) === entry.incident_id);
    if (hit) {
      await updateRow(spreadsheetId, 'IncidentIndex', hit.rowNumber, {
        tab_month: entry.tab_month,
        status: entry.status,
        category_id: entry.category_id,
        shift_instance_id: entry.shift_instance_id,
        outside_shift: entry.outside_shift,
        reported_at: entry.reported_at,
        is_test: entry.is_test ?? false,
        updated_at: new Date().toISOString(),
      });
      return;
    }
  } catch {
    // sheet kosong — insert di bawah
  }
  await insertRow(spreadsheetId, 'IncidentIndex', {
    incident_id: entry.incident_id,
    tab_month: entry.tab_month,
    status: entry.status,
    category_id: entry.category_id,
    shift_instance_id: entry.shift_instance_id,
    outside_shift: entry.outside_shift,
    reported_at: entry.reported_at,
    is_test: entry.is_test ?? false,
    updated_at: new Date().toISOString(),
  });
}

/** Pastikan tab bulanan Incidents/IncidentNotes siap tulis. */
export async function ensureIncidentTabs(spreadsheetId: string, tabMonth: string): Promise<void> {
  await ensureMonthlySheet(spreadsheetId, 'Incidents', tabMonth);
  await ensureMonthlySheet(spreadsheetId, 'IncidentNotes', tabMonth);
}
