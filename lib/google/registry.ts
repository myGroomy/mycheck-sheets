// lib/google/registry.ts
// Resolver akses data — pengganti Registry.js (getRegistry_, resolveCabangSpreadsheet_,
// getCabangList, getSettingsGlobal_) di Google Apps Script.
//
// Spreadsheet Registry (input: { REGISTRY_SPREADSHEET_ID }) memuat sheet:
//   - Daftar_Cabang: { Cabang_ID, ... , Spreadsheet_ID, Folder_Drive_ID, Aktif }
//   - Settings_Global : { Key, Value }
//   - Template_Referensi : { Template_Spreadsheet_ID di baris 2 kolom 1 }
//   - Users : { User_ID, Username, PIN, Nama, Role, Cabang_ID, Aktif, Created_At }

import { getSheetsClient } from './client';
import { readSheetData, sheetToObjects, getCellValue } from './sheets';

export interface CabangRecord {
  Cabang_ID: string;
  Nama_Cabang?: string;
  Spreadsheet_ID?: string;
  Folder_Drive_ID?: string;
  Aktif?: boolean | string;
  [key: string]: unknown;
}

let _registryId: string | null = null;
let _cabangCache: Record<string, { spreadsheetId: string; folderId: string; cabang: CabangRecord }> = {};
let _cabangListCache: CabangRecord[] | null = null;

export function getRegistrySpreadsheetId(): string {
  if (_registryId) return _registryId;
  const id = process.env.REGISTRY_SPREADSHEET_ID;
  if (!id) {
    throw new Error('REGISTRY_SPREADSHEET_ID belum dikonfigurasi di env');
  }
  _registryId = id;
  return _registryId;
}

/**
 * Hapus baris (1-based, termasuk header sebagai baris 1) dari sebuah sheet
 * spreadsheet manapun. Dipakai untuk CRUD Registry & spreadsheet cabang.
 */
export async function deleteSheetRows(
  spreadsheetId: string,
  sheetName: string,
  rowNumber1Based: number
): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });
  const target = (meta.data.sheets || []).find(
    (s) => s.properties?.title === sheetName
  );
  if (!target?.properties?.sheetId) {
    throw new Error('Sheet tidak ditemukan: ' + sheetName);
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: target.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber1Based - 1,
              endIndex: rowNumber1Based,
            },
          },
        },
      ],
    },
  });
}

export function resetRegistryCache(): void {
  _registryId = null;
  _cabangCache = {};
  _cabangListCache = null;
}

/** Daftar cabang aktif dari registry. */
export async function getCabangList(): Promise<CabangRecord[]> {
  if (_cabangListCache) return _cabangListCache;
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, 'Daftar_Cabang');
  const list = sheetToObjects(headers, rows) as CabangRecord[];
  _cabangListCache = list.filter((r) => {
    const v = r['Aktif'];
    return v === true || v === 'true' || v === 'TRUE' || v === 'True';
  });
  return _cabangListCache;
}

/**
 * Resolve spreadsheet + folder untuk satu cabang. Mirip resolveCabangSpreadsheet_,
 * tapi tanpa cache GAS di memori proses (hanya cache sederhana per-branch).
 */
export async function resolveCabang(cabangId: string): Promise<{
  spreadsheetId: string;
  folderId: string;
  cabang: CabangRecord;
}> {
  if (_cabangCache[cabangId]) return _cabangCache[cabangId];

  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, 'Daftar_Cabang');
  const list = sheetToObjects(headers, rows) as CabangRecord[];
  const cabang = list.find((r) => r['Cabang_ID'] === cabangId);
  if (!cabang) throw new Error('CABANG_TIDAK_DITEMUKAN: ' + cabangId);
  const isAktif = (v: unknown) => v === true || v === 'true' || v === 'TRUE' || v === 'True';
  if (!isAktif(cabang['Aktif'])) {
    throw new Error('CABANG_TIDAK_AKTIF: ' + cabangId);
  }

  const spreadsheetId = String(cabang['Spreadsheet_ID'] || '');
  const folderId = String(cabang['Folder_Drive_ID'] || '');
  if (!spreadsheetId) throw new Error('Spreadsheet_ID kosong untuk cabang ' + cabangId);

  const resolved = { spreadsheetId, folderId, cabang };
  _cabangCache[cabangId] = resolved;
  return resolved;
}

export async function cabangExists(cabangId: string): Promise<boolean> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, 'Daftar_Cabang');
  const list = sheetToObjects(headers, rows) as CabangRecord[];
  return list.some((r) => r['Cabang_ID'] === cabangId);
}

/** Nilai dari sheet Settings_Global → object { Key: Value }. */
export async function getSettingsGlobal(): Promise<Record<string, string>> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, 'Settings_Global');
  const objs = sheetToObjects(headers, rows);
  const result: Record<string, string> = {};
  objs.forEach((r) => {
    result[String(r['Key'])] = String(r['Value'] ?? '');
  });
  return result;
}

/** Ambil Template_Spreadsheet_ID dari sheet Template_Referensi (baris 2, kolom 1). */
export async function getTemplateSpreadsheetId(): Promise<string> {
  const registryId = getRegistrySpreadsheetId();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Template_Referensi!A2' });
  const value = res.data.values?.[0]?.[0];
  if (!value) throw new Error('Template_Spreadsheet_ID belum diisi di Registry');
  return String(value);
}

/** Ambil nilai sel mentah dari registry. */
export async function getRegistryCellValue(range: string): Promise<unknown> {
  return getCellValue(getRegistrySpreadsheetId(), range);
}
