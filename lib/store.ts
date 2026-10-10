// lib/store.ts
// Lapisan akses data berbasis Google Sheets pengganti lib/db (Drizzle/Postgres).

import { getSheetsClient } from './google/client';
import {
  readSheetData,
  readSheetsBatch,
  appendRows,
  writeCells,
  writeRow,
  columnIndexToLetter,
} from './google/sheets';
import { getHeaders, rowFromObject, monthlySheet, MONTHLY_SHEETS } from './google/branch-schema';

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

export async function listRowsWithNumber(spreadsheetId: string, sheet: string): Promise<Row[]> {
  const { headers, rows } = await readSheetData(spreadsheetId, sheet);
  return rows.map((row, i) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return { rowNumber: i + 2, data: obj };
  });
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
  try {
    return await listRows(spreadsheetId, monthlySheet(base, tabMonth));
  } catch {
    return [];
  }
}

/** Pastikan sheet bulanan ada (dibuat otomatis jika bulan baru) */
export async function ensureMonthlySheet(spreadsheetId: string, base: string, tabMonth: string): Promise<string> {
  const name = monthlySheet(base, tabMonth);
  const headers = MONTHLY_SHEETS[base];
  if (!headers) throw new Error('Unknown monthly sheet: ' + base);
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === name);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
    });
    await writeRow(spreadsheetId, `${name}!A1`, headers);
  }
  return name;
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
  return v === true || v === 'true' || v === 'TRUE' || v === 'True' || v === '1' || v === 1;
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
