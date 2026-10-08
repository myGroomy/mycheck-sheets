// lib/google/settings-admin.ts
// CRUD sheet `Settings_Global` (Key | Value) pada Registry.
//
// Catatan: `_meta` per spreadsheet cabang dibaca langsung lewat
// `lib/store.ts` (lihat `lib/db/snapshot.ts` untuk tolerance_default_minutes)
// sehingga tidak perlu helper baca/tulis terpisah di sini.

import { readSheetData, sheetToObjects, writeCells, appendRows } from './sheets';
import { getRegistrySpreadsheetId } from './registry';
import { listRowsWithNumber } from '../store';

const SETTINGS_SHEET = 'Settings_Global';

export interface GlobalSetting {
  key: string;
  value: string;
  rowNumber: number;
}

export async function listGlobalSettings(): Promise<GlobalSetting[]> {
  const rows = await listRowsWithNumber(getRegistrySpreadsheetId(), SETTINGS_SHEET);
  return rows.map((r) => ({
    key: String(r.data['Key'] ?? ''),
    value: String(r.data['Value'] ?? ''),
    rowNumber: r.rowNumber,
  }));
}

/** Tulis beberapa nilai pada sheet Settings_Global dalam satu request. */
export async function writeGlobalSettings(
  updates: { rowNumber: number; value: string }[]
): Promise<void> {
  if (updates.length === 0) return;
  await writeCells(
    getRegistrySpreadsheetId(),
    updates.map((u) => ({ range: `${SETTINGS_SHEET}!B${u.rowNumber}`, value: u.value }))
  );
}

/** Pastikan semua key katalog punya baris di Settings_Global. */
export async function ensureCatalogRows(
  defaults: { key: string; value: string }[]
): Promise<{ created: number }> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, SETTINGS_SHEET);
  const have = new Set((sheetToObjects(headers, rows) as Record<string, unknown>[]).map((r) => String(r['Key'] ?? '')));
  const missing = defaults.filter((d) => !have.has(d.key)).map((d) => [d.key, d.value]);
  if (missing.length > 0) {
    await appendRows(registryId, SETTINGS_SHEET, missing);
  }
  return { created: missing.length };
}