// lib/admin/settings-catalog.ts
// Katalog pengaturan global.
//
// Di versi PostgreSQL ada tabel `settings` dengan kolom value_type.
// Sheet Registry `Settings_Global` hanya punya Key | Value, jadi tipe dan
// metadata disimpan di katalog ini (satu-satunya sumber kebenaran tipe).

export type SettingValueType = 'int' | 'bool' | 'string' | 'text';

export interface SettingDefinition {
  key: string;
  value: string;
  valueType: SettingValueType;
  description: string;
}

/**
 * Pengaturan yang tersedia. `value` di sini adalah nilai default dan juga
 * ditulis ke Settings_Global saat registry diinisialisasi.
 */
export const SETTINGS_CATALOG: SettingDefinition[] = [
  {
    key: 'tolerance_default_minutes',
    value: '15',
    valueType: 'int',
    description:
      'Toleransi keterlambatan default (menit) untuk point checklist yang punya target waktu.',
  },
  {
    key: 'min_pin_length',
    value: '4',
    valueType: 'int',
    description: 'Panjang minimum PIN petugas.',
  },
  {
    key: 'session_hours',
    value: '12',
    valueType: 'int',
    description: 'Masa berlaku sesi login (jam).',
  },
  {
    key: 'require_pin_on_close',
    value: 'TRUE',
    valueType: 'bool',
    description: 'Wajib asksPIN admin/petugas saat menutup shift.',
  },
  {
    key: 'allow_skip_required',
    value: 'TRUE',
    valueType: 'bool',
    description: 'Izinkan point wajib di-skip bila ada alasan.',
  },
  {
    key: 'app_notice',
    value: '',
    valueType: 'text',
    description: 'Pengumuman yang tampil di halaman login.',
  },
];

const BY_KEY = new Map(SETTINGS_CATALOG.map((s) => [s.key, s]));

export function getSettingDefinition(key: string): SettingDefinition | null {
  return BY_KEY.get(key) ?? null;
}

/** Periksa nilai sesuai value_type katalog. Return pesan error atau null. */
export function validateSettingValue(
  def: SettingDefinition,
  value: string
): string | null {
  if (def.valueType === 'int' && !/^-?\d+$/.test(value)) {
    return `Nilai untuk '${def.key}' harus berupa angka bulat.`;
  }
  if (def.valueType === 'bool' && !['TRUE', 'FALSE'].includes(value)) {
    return `Nilai untuk '${def.key}' harus 'TRUE' atau 'FALSE'.`;
  }
  return null;
}

/** Parse nilai sesuai value_type agar frontend bisa menampilkannya. */
export function coerceSettingValue(
  valueType: SettingValueType,
  value: string
): string | number | boolean {
  if (valueType === 'int') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (valueType === 'bool') return value === 'TRUE';
  return value;
}