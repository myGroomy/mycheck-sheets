// lib/maintenance.ts
// Cek mode maintenance dari Settings_Global dengan cache in-memory.
//
// Maintenance mode memblokir akses seluruh user (kecuali admin) ke semua
// halaman. Admin tetap bisa mengakses /admin/pengaturan untuk menonaktifkan.
//
// Cache TTL 30 detik supaya tidak memanggil Google Sheets API di setiap
// request. Kalau admin toggle maintenance, efeknya maksimal 30 detik.

import { listGlobalSettings } from './google/settings-admin';

const CACHE_TTL_MS = 30_000;
let cachedValue: boolean | null = null;
let cachedAt = 0;

export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cachedValue !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedValue;
  }

  try {
    const settings = await listGlobalSettings();
    const row = settings.find((s) => s.key === 'maintenance_mode');
    cachedValue = row?.value === 'TRUE';
    cachedAt = now;
    return cachedValue;
  } catch {
    // Fail closed: kalau tidak bisa baca, anggap tidak maintenance.
    return false;
  }
}

/** Reset cache (dipakai di test atau setelah toggle). */
export function resetMaintenanceCache(): void {
  cachedValue = null;
  cachedAt = 0;
}
