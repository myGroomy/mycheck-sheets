// lib/google/sheets.ts
// Operasi CRUD dasar Google Sheets API v4 pengganti fungsi helper GAS
// seperti sheetToObjects_, appendRow, setValues, getLastRow, getRange.

import { getSheetsClient } from './client';

export interface SheetData {
  headers: string[];
  rows: unknown[][];
}

/**
 * Cache baca per (spreadsheet, range) dengan TTL pendek.
 *
 * Setiap `values.get` adalah 1 panggilan API, dan kuota Sheets per menit untuk
 * service account itu kecil. Dua sumber pemborosan yang paling nyata:
 *   - request paralel untuk data yang sama (5 petugas menekan item bersamaan)
 *   - satu request yang membaca sheet sama beberapa kali beruntun
 * Keduanya hilang kalau baca yang identik berbagi satu promise (single-flight)
 * dan hasilnya disimpan sebentar.
 *
 * TTL sengaja pendek (lihat SHEET_READ_TTL_MS) supaya data shift yang baru
 * ditulis tidak tampil basi terlalu lama. Setiap operasi tulis di bawah
 * memanggil invalidateSheetCache() supaya request berikutnya baca data segar.
 */
const SHEET_READ_TTL_MS = 15_000;

interface CacheSlot {
  promise: Promise<SheetData>;
  expiresAt: number;
}

const readCache = new Map<string, CacheSlot>();

function cacheKey(spreadsheetId: string, range: string): string {
  return `${spreadsheetId}!${range}`;
}

/** Buang cache baca untuk satu spreadsheet (panggil setelah setiap tulis). */
export function invalidateSheetCache(spreadsheetId?: string): void {
  if (!spreadsheetId) {
    readCache.clear();
    return;
  }
  const prefix = `${spreadsheetId}!`;
  for (const key of [...readCache.keys()]) {
    if (key.startsWith(prefix)) readCache.delete(key);
  }
}

/** Baca dengan single-flight + TTL. Lihat catatan di atas. */
async function readSheetDataCached(
  spreadsheetId: string,
  range: string
): Promise<SheetData> {
  const key = cacheKey(spreadsheetId, range);
  const hit = readCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.promise;

  const promise = readSheetDataUncached(spreadsheetId, range);
  readCache.set(key, { promise, expiresAt: Date.now() + SHEET_READ_TTL_MS });
  try {
    return await promise;
  } catch (error) {
    // Jangan tahan hasil gagal request berikutnya harus mencoba lagi.
    if (readCache.get(key)?.promise === promise) readCache.delete(key);
    throw error;
  }
}

/**
 * Baca seluruh data sebuah sheet TANPA membuang baris kosong. Nomor baris
 * fisik (1-based, baris header = 1) dapat dihitung dari index di rows:
 * `rowNumber = i + 2`. Dipakai ketika posisi baris harus dipertahankan
 * (mis. update sel in-place di sheet yang menampung banyak laporan).
 */
export async function readSheetDataRaw(
  spreadsheetId: string,
  range: string
): Promise<SheetData> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const values = res.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };
  const headers = (values[0] || []).map((h) => String(h).trim());
  return { headers, rows: values.slice(1) };
}

/**
 * Baca seluruh data sebuah sheet dan kembalikan sebagai { headers, rows }.
 * Baris kosong (tanpa nilai di semua sel) dihilangkan agar konsisten dengan
 * sheetToObjects_ yang mengabaikan baris kosong.
 */
export async function readSheetData(
  spreadsheetId: string,
  range: string
): Promise<SheetData> {
  return readSheetDataCached(spreadsheetId, range);
}

/**
 * Baca DARI LUAR cache selalu memanggil API.
 *
 * Wajib dipakai untuk operasi sensitif yang tidak boleh melihat data basi,
 * terutama verifikasi PIN admin: kalau PIN baru saja di-reset, verifikasi
 * harus langsung memakai nilai baru (lihat lib/admin/sensitive-action.ts).
 */
export async function readSheetDataFresh(
  spreadsheetId: string,
  range: string
): Promise<SheetData> {
  return readSheetDataUncached(spreadsheetId, range);
}

async function readSheetDataUncached(
  spreadsheetId: string,
  range: string
): Promise<SheetData> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const values = res.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };

  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows = values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ''));
  return { headers, rows };
}

/**
 * Baca beberapa sheet dalam SATU panggilan API (`values.batchGet`).
 * Mengembalikan array SheetData dengan urutan sama seperti `ranges`.
 *
 * Dipakai ketika satu request butuh beberapa sheet dari spreadsheet yang sama —
 * memangkas jumlah panggilan API (kuota) sekaligus menurunkan latensi.
 */
export async function readSheetsBatch(
  spreadsheetId: string,
  ranges: string[]
): Promise<SheetData[]> {
  if (ranges.length === 0) return [];
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  });

  return (res.data.valueRanges || []).map((vr) => {
    const values = vr.values || [];
    if (values.length === 0) return { headers: [], rows: [] };
    const headers = (values[0] || []).map((h) => String(h).trim());
    const rows = values
      .slice(1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ''));
    return { headers, rows };
  });
}

/**
 * Konversi { headers, rows } menjadi array objek dengan kunci = header.
 * Mirip sheetToObjects_ di GAS.
 */
export function sheetToObjects(headers: string[], rows: unknown[][]): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

/**
 * Cari index baris (0-based di dalam rows, di mana row[0] = baris data pertama
 * setelah header) berdasarkan nilai pada kolom tertentu. Mengembalikan
 * { index, row }. index = -1 bila tidak ditemukan.
 */
export function findRowIndex(
  rows: unknown[][],
  columnIndex: number,
  value: string
): { index: number; row: unknown[] | null } {
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][columnIndex]) === value) {
      return { index: i, row: rows[i] };
    }
  }
  return { index: -1, row: null };
}

/** Ambil nilai satu sel. */
export async function getCellValue(
  spreadsheetId: string,
  range: string
): Promise<unknown> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const values = res.data.values || [];
  return values[0]?.[0];
}

/**
 * Tulis satu baris penuh (1 row, N columns) ke posisi tertentu.
 * Index 1-based seperti spreadsheets API.
 */
export async function writeRow(
  spreadsheetId: string,
  range: string,
  row: unknown[]
): Promise<void> {
  invalidateSheetCache(spreadsheetId);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    // RAW: jangan biarkan Sheets mengurai string (mis. "2026-10-08" -> serial
    // angka 46303, "true" -> boolean TRUE). Nilai harus tersimpan apa adanya.
    valueInputOption: 'RAW',
    requestBody: { values: [row.map(toCellValue)] },
  });
}

/** Set nilai satu sel. */
export async function setCellValue(
  spreadsheetId: string,
  range: string,
  value: unknown
): Promise<void> {
  await writeRow(spreadsheetId, range, [value]);
}

/**
 * Normalisasi nilai menjadi apa yang bisa disimpan Sheets tanpa interpretasi:
 * boolean -> 'TRUE'/'FALSE', objek -> JSON, null/undefined -> string kosong.
 */
export function toCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Tulis banyak sel sekaligus dalam SATU request (multi-range batch update).
 * Dipakai untuk memperbarui beberapa kolom pada satu baris tanpa boros
 * kuota API satu panggilan HTTP, bukan satu per kolom.
 */
export async function writeCells(
  spreadsheetId: string,
  cells: { range: string; value: unknown }[]
): Promise<void> {
  if (cells.length === 0) return;
  invalidateSheetCache(spreadsheetId);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: cells.map((c) => ({
        range: c.range,
        values: [[toCellValue(c.value)]] as string[][],
      })),
    },
  });
}

/**
 * Hapus 1 baris data pada index (1-based, termasuk header = baris 1).
 * Menggunakan deleteDimension untuk menghapus baris secara permanen.
 */
export async function deleteRow(
  spreadsheetId: string,
  sheetName: string,
  rowNumber1Based: number
): Promise<void> {
  invalidateSheetCache(spreadsheetId);
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

/**
 * Append beberapa baris sekaligus ke bagian bawah sheet (batch write).
 * Mempertahankan pola `setValues` 1 batch daripada 1 write per baris.
 */
export async function appendRows(
  spreadsheetId: string,
  sheetName: string,
  rows: unknown[][]
): Promise<void> {
  if (rows.length === 0) return;
  invalidateSheetCache(spreadsheetId);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    // RAW: pertahankan nilai apa adanya (lihat catatan di writeRow).
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows.map((r) => r.map(toCellValue)) },
  });
}

/**
 * Pastikan sebuah sheet dengan judul tertentu ada di spreadsheet.
 * Bila belum ada, buat sheet baru lalu tulis baris header.
 * Bila sudah ada tapi baris header-nya beda, perbarui header agar konsisten.
 */
export async function ensureSheet(
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[]
): Promise<void> {
  invalidateSheetCache(spreadsheetId);
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties?.title === sheetTitle
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTitle } } }],
      },
    });
    await writeRow(spreadsheetId, `${sheetTitle}!A1`, headers);
    return;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
  });
  const current = (res.data.values?.[0] || []).map((h) => String(h).trim());
  const needsUpdate =
    current.length !== headers.length ||
    current.some((h, i) => h !== headers[i]);
  if (needsUpdate) {
    await writeRow(spreadsheetId, `${sheetTitle}!A1`, headers);
  }
}

/** Konversi index kolom 0-based menjadi huruf kolom Sheets (0 -> A, 10 -> K, 26 -> AA, dst). */
export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

