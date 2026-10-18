// lib/store.ts
// Lapisan akses data berbasis Google Sheets pengganti lib/db (Drizzle/Postgres).

import { getSheetsClient } from './google/client';
import {
  readSheetData,
  readSheetDataFresh,
  readSheetDataRaw,
  readSheetsBatch,
  appendRows,
  writeCells,
  writeRow,
  columnIndexToLetter,
} from './google/sheets';
import { getHeaders, rowFromObject, periodSheetName, MONTHLY_SHEETS, YEARLY_SHEETS, type PeriodMode } from './google/branch-schema';
import { listBranchSheetTitles, readBranchSchemaVersion } from './schema/version';

export interface Row<T = Record<string, unknown>> {
  rowNumber: number; // 1-based, baris fisik di sheet (baris 1 = header)
  data: T;
}

export async function listRows(spreadsheetId: string, sheet: string): Promise<Record<string, unknown>[]> {
  const { headers, rows } = await readSheetData(spreadsheetId, sheet);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

export async function listRowsFresh(
  spreadsheetId: string,
  sheet: string
): Promise<Record<string, unknown>[]> {
  const { headers, rows } = await readSheetDataFresh(spreadsheetId, sheet);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => { obj[header] = row[index]; });
    return obj;
  });
}

export async function listRowsWithNumber(spreadsheetId: string, sheet: string): Promise<Row[]> {
  const { headers, rows } = await readSheetData(spreadsheetId, sheet);
  return rows.map((row, i) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return { rowNumber: i + 2, data: obj };
  });
}

export async function listRowsWithNumberFresh(
  spreadsheetId: string,
  sheet: string
): Promise<Row[]> {
  const { headers, rows } = await readSheetDataRaw(spreadsheetId, sheet);
  return rows.map((row, index) => {
    const data: Record<string, unknown> = {};
    headers.forEach((header, column) => { data[header] = row[column]; });
    return { rowNumber: index + 2, data };
  });
}

export async function findRowFresh(
  spreadsheetId: string,
  sheet: string,
  column: string,
  value: string
): Promise<Row | null> {
  const rows = await listRowsWithNumberFresh(spreadsheetId, sheet);
  return rows.find((row) => String(row.data[column] ?? '') === value) ?? null;
}

export async function findRow(spreadsheetId: string, sheet: string, column: string, value: string): Promise<Row | null> {
  const rows = await listRowsWithNumber(spreadsheetId, sheet);
  return rows.find((r) => String(r.data[column] ?? '') === value) ?? null;
}

export async function filterRows(spreadsheetId: string, sheet: string, predicate: (row: Record<string, unknown>) => boolean): Promise<Record<string, unknown>[]> {
  const rows = await listRows(spreadsheetId, sheet);
  return rows.filter(predicate);
}

/**
 * Baca beberapa sheet statis sekaligus (1 panggilan API) lalu filter masing-masing.
 * Dipakai untuk request yang butuh data dari >1 sheet (mis. ShiftInstances +
 * Reports + IncidentIndex) supaya tidak satu panggilan per sheet.
 */
export async function filterRowsMulti(
  spreadsheetId: string,
  specs: { sheet: string; predicate?: (row: Record<string, unknown>) => boolean }[]
): Promise<Record<string, unknown>[][]> {
  if (specs.length === 0) return [];
  const data = await readSheetsBatch(spreadsheetId, specs.map((s) => s.sheet));

  return specs.map((spec, i) => {
    const { headers, rows } = data[i] ?? { headers: [], rows: [] };
    const objects = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    });
    return spec.predicate ? objects.filter(spec.predicate) : objects;
  });
}

/** Baca baris sheet bulanan secara aman: [] bila sheet belum ada */
export async function listMonthlyRows(spreadsheetId: string, base: string, tabMonth: string): Promise<Record<string, unknown>[]> {
  return listPeriodRows(spreadsheetId, base, tabMonth, false);
}

/** Versi fresh (bukan cache 15s) untuk data yang baru ditulis, mis. handshake/ack. */
export async function listMonthlyRowsFresh(
  spreadsheetId: string,
  base: string,
  tabMonth: string,
): Promise<Record<string, unknown>[]> {
  return listPeriodRows(spreadsheetId, base, tabMonth, true);
}

/**
 * Baca periode aktif. Mode flat membaca satu sheet generik; mode yearly
 * membaca sheet tahunan lalu sheet bulanan legacy secara dual-read.
 * Baris dengan id sama hanya dikembalikan sekali.
 */
export async function listPeriodRows(
  spreadsheetId: string,
  base: string,
  tabMonth: string,
  fresh = false,
): Promise<Record<string, unknown>[]> {
  const { periodMode } = await readBranchSchemaVersion(spreadsheetId);
  const primary = periodSheetName(base, tabMonth, periodMode);
  const read = fresh ? listRowsFresh : listRows;
  const names = [primary];
  if (periodMode === 'yearly') {
    try {
      const titles = await listBranchSheetTitles(spreadsheetId);
      names.push(...titles.filter((title) => title.startsWith(`${base}_`) && /^\d{4}-\d{2}$/.test(title.slice(base.length + 1))));
    } catch {
      // Jika metadata gagal, sheet tahunan tetap dapat dibaca.
    }
  }
  const result: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    try {
      for (const row of await read(spreadsheetId, name)) {
        const id = String(row.id ?? '');
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        result.push(row);
      }
    } catch {
      // Periode belum dibuat adalah kondisi normal.
    }
  }
  return result;
}

/** Nama sheet periode aktif untuk operasi update/append satu baris. */
export async function getPeriodSheet(
  spreadsheetId: string,
  base: string,
  tabMonth: string,
): Promise<string> {
  const { periodMode } = await readBranchSchemaVersion(spreadsheetId);
  return periodSheetName(base, tabMonth, periodMode);
}

/** Kunci periode yang benar-benar tersedia di spreadsheet. */
export async function listPeriodKeys(spreadsheetId: string, base: string): Promise<string[]> {
  const titles = await listBranchSheetTitles(spreadsheetId);
  const { periodMode } = await readBranchSchemaVersion(spreadsheetId);
  if (periodMode === 'flat') return titles.includes(base) ? ['flat'] : [];
  const keys = new Set<string>();
  for (const title of titles) {
    if (!title.startsWith(`${base}_`)) continue;
    const suffix = title.slice(base.length + 1);
    if (/^\d{4}-\d{2}$/.test(suffix)) keys.add(suffix);
    else if (/^\d{4}$/.test(suffix)) keys.add(`${suffix}-01`);
  }
  return [...keys].sort();
}

/** Pastikan sheet periode aktif ada, termasuk sheet tahunan. */
export async function ensurePeriodSheet(
  spreadsheetId: string,
  base: string,
  tabMonth: string,
  mode?: PeriodMode,
): Promise<string> {
  const periodMode = mode ?? (await readBranchSchemaVersion(spreadsheetId)).periodMode;
  const name = periodSheetName(base, tabMonth, periodMode);
  const headers = (periodMode === 'yearly' ? YEARLY_SHEETS : MONTHLY_SHEETS)[base];
  if (!headers) throw new Error('Unknown period sheet: ' + base);
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = (meta.data.sheets || []).some((sheet) => sheet.properties?.title === name);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
    });
    await writeRow(spreadsheetId, `${name}!A1`, headers);
  }
  return name;
}

/** Kompatibilitas nama lama; sekarang mengikuti period_mode cabang. */
export async function ensureMonthlySheet(spreadsheetId: string, base: string, tabMonth: string): Promise<string> {
  return ensurePeriodSheet(spreadsheetId, base, tabMonth);
}

export async function insertRow(spreadsheetId: string, sheet: string, obj: Record<string, unknown>): Promise<void> {
  await appendRows(spreadsheetId, sheet, [rowFromObject(sheet, obj)]);
}

/** Perbarui kolom terpilih pada satu baris satu panggilan API untuk semua kolom. */
export async function updateRow(spreadsheetId: string, sheet: string, rowNumber: number, updates: Record<string, unknown>): Promise<void> {
  const headers = getHeaders(sheet);
  const cells = Object.entries(updates).map(([key, value]) => {
    const colIdx = headers.indexOf(key);
    if (colIdx === -1) throw new Error(`Kolom ${key} tidak ada di sheet ${sheet}`);
    return { range: `${sheet}!${columnIndexToLetter(colIdx)}${rowNumber}`, value };
  });
  await writeCells(spreadsheetId, cells);
}

export async function replaceRow(spreadsheetId: string, sheet: string, rowNumber: number, obj: Record<string, unknown>): Promise<void> {
  const row = rowFromObject(sheet, obj);
  const lastCol = columnIndexToLetter(getHeaders(sheet).length - 1);
  await writeRow(spreadsheetId, `${sheet}!A${rowNumber}:${lastCol}${rowNumber}`, row);
}

export function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'TRUE' || v === 'True' || v === 'yes' || v === 'YES' || v === 'Yes' || v === '1' || v === 1;
}
export function asNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function asStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}
export function asJson<T>(v: unknown): T | null {
  if (!v) return null;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return null; }
}
