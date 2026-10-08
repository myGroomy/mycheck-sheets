// lib/google/registry-admin.ts
// CRUD untuk sheet-sheet Registry (Daftar_Cabang + Users).
// Registry memakai konvensi PascalCase kolom (sama seperti stokis),
// sedangkan spreadsheet cabang memakai snake_case.

import {
  readSheetData,
  sheetToObjects,
  writeCells,
  appendRows,
  columnIndexToLetter,
} from './sheets';
import { getRegistrySpreadsheetId, resetRegistryCache, deleteSheetRows } from './registry';
import { asBool, asStr } from '../store';

export const CABANG_SHEET = 'Daftar_Cabang';
export const USERS_SHEET = 'Users';

export interface CabangRow {
  Cabang_ID: string;
  Nama_Cabang: string;
  Kode: string;
  Timezone: string;
  Spreadsheet_ID: string;
  Folder_Drive_ID: string;
  Aktif: boolean;
  [key: string]: unknown;
}

export interface UserRow {
  User_ID: string;
  Username: string;
  PIN: string;
  Nama: string;
  Role: string;
  Cabang_ID: string;
  Aktif: boolean;
  Must_Change_Pin: boolean;
  Created_At: string;
  [key: string]: unknown;
}

/** Kolom per sheet Registry — dipakai untuk menulis baris. */
const CABANG_HEADERS = [
  'Cabang_ID',
  'Nama_Cabang',
  'Kode',
  'Timezone',
  'Spreadsheet_ID',
  'Folder_Drive_ID',
  'Aktif',
];
const USER_HEADERS = [
  'User_ID',
  'Username',
  'PIN',
  'Nama',
  'Role',
  'Cabang_ID',
  'Aktif',
  'Must_Change_Pin',
  'Created_At',
];

export { CABANG_HEADERS, USER_HEADERS };

/** Tulis nilai pada beberapa sel sheet Registry dalam satu request. */
async function writeRegistryCells(
  registryId: string,
  sheet: string,
  cells: { row: number; col: number; value: unknown }[]
): Promise<void> {
  if (cells.length === 0) return;
  await writeCells(
    registryId,
    cells.map((c) => ({
      range: `${sheet}!${columnIndexToLetter(c.col)}${c.row}`,
      value: c.value,
    }))
  );
}

// ============================================
// Cabang
// ============================================

export async function listAllCabang(): Promise<CabangRow[]> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, CABANG_SHEET);
  return (sheetToObjects(headers, rows) as CabangRow[]).map((r) => ({
    ...r,
    Cabang_ID: asStr(r.Cabang_ID),
    Nama_Cabang: asStr(r.Nama_Cabang),
    Kode: asStr(r.Kode),
    Timezone: asStr(r.Timezone),
    Spreadsheet_ID: asStr(r.Spreadsheet_ID),
    Folder_Drive_ID: asStr(r.Folder_Drive_ID),
    Aktif: asBool(r.Aktif),
  }));
}

export async function insertCabang(row: CabangRow): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  await appendRows(registryId, CABANG_SHEET, [
    CABANG_HEADERS.map((h) => row[h as keyof CabangRow] ?? ''),
  ]);
  resetRegistryCache();
}

export async function updateCabangCells(
  rowNumber: number,
  updates: Partial<CabangRow>
): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  const cells = Object.entries(updates).map(([key, value]) => {
    const col = CABANG_HEADERS.indexOf(key);
    if (col === -1) throw new Error(`Kolom ${key} tidak dikenal di ${CABANG_SHEET}`);
    return { row: rowNumber, col, value };
  });
  await writeRegistryCells(registryId, CABANG_SHEET, cells);
  resetRegistryCache();
}

export async function deleteCabangRow(rowNumber: number): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  await deleteSheetRows(registryId, CABANG_SHEET, rowNumber);
  resetRegistryCache();
}

// ============================================
// Users
// ============================================

export async function listAllUsers(): Promise<UserRow[]> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, USERS_SHEET);
  return (sheetToObjects(headers, rows) as UserRow[]).map((r) => ({
    ...r,
    User_ID: asStr(r.User_ID),
    Username: asStr(r.Username),
    PIN: asStr(r.PIN),
    Nama: asStr(r.Nama),
    Role: asStr(r.Role),
    Cabang_ID: asStr(r.Cabang_ID),
    Aktif: asBool(r.Aktif),
    Must_Change_Pin: asBool(r.Must_Change_Pin),
    Created_At: asStr(r.Created_At),
  }));
}

export async function insertUser(row: UserRow): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  await appendRows(registryId, USERS_SHEET, [
    USER_HEADERS.map((h) => row[h as keyof UserRow] ?? ''),
  ]);
}

export async function updateUserCells(
  rowNumber: number,
  updates: Partial<UserRow>
): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  const cells = Object.entries(updates).map(([key, value]) => {
    const col = USER_HEADERS.indexOf(key);
    if (col === -1) throw new Error(`Kolom ${key} tidak dikenal di ${USERS_SHEET}`);
    return { row: rowNumber, col, value };
  });
  await writeRegistryCells(registryId, USERS_SHEET, cells);
}

export async function deleteUserRow(rowNumber: number): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  await deleteSheetRows(registryId, USERS_SHEET, rowNumber);
}

/** Daftar id cabang yang boleh diakses user (kolom Cabang_ID dipisah koma). */
export function branchIdsOf(user: UserRow): string[] {
  return asStr(user.Cabang_ID)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}