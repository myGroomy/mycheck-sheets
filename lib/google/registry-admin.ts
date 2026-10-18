// lib/google/registry-admin.ts
// CRUD untuk sheet-sheet Registry (Daftar_Cabang + Users).
// Registry memakai konvensi PascalCase kolom (sama seperti stokis),
// sedangkan spreadsheet cabang memakai snake_case.

import {
  readSheetData,
  readSheetDataRaw,
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
  Alamat: string;
  Branch_Folder_ID?: string;
  Evidence_Folder_ID?: string;
  Arsip_Spreadsheet_IDs?: string;
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

/** Kolom per sheet Registry dipakai untuk menulis baris. */
const CABANG_HEADERS = [
  'Cabang_ID',
  'Nama_Cabang',
  'Kode',
  'Timezone',
  'Spreadsheet_ID',
  'Folder_Drive_ID',
  'Aktif',
  // PRD ADM-BR-01 / PRD S10 menyebut "alamat singkat". Ditambahkan di akhir
  // supaya kolom lama tidak bergeser dan data existing tidak perlu dimigrasi.
  'Alamat',
  'Arsip_Spreadsheet_IDs',
  'Branch_Folder_ID',
  'Evidence_Folder_ID',
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

export async function getCabangList(): Promise<CabangRow[]> {
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
    Alamat: asStr(r.Alamat),
    Branch_Folder_ID: asStr(r.Branch_Folder_ID),
    Evidence_Folder_ID: asStr(r.Evidence_Folder_ID),
  }));
}

export async function updateCabangStructure(
  cabangId: string,
  updates: {
    spreadsheetId?: string;
    folderDriveId?: string;
    branchFolderId?: string;
    evidenceFolderId?: string;
    aktif?: boolean;
  }
): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetDataRaw(registryId, CABANG_SHEET);
  const branchColumn = headers.indexOf('Cabang_ID');
  if (branchColumn < 0) {
    throw new Error('Kolom Cabang_ID tidak ditemukan di Registry');
  }
  const rowIndex = rows.findIndex((row) => asStr(row[branchColumn]) === cabangId);
  if (rowIndex < 0) throw new Error('CABANG_TIDAK_DITEMUKAN: ' + cabangId);

  const cells: { row: number; col: number; value: unknown }[] = [];
  const map: Record<string, unknown> = {};
  if (updates.spreadsheetId !== undefined) map['Spreadsheet_ID'] = updates.spreadsheetId;
  if (updates.folderDriveId !== undefined) map['Folder_Drive_ID'] = updates.folderDriveId;
  if (updates.branchFolderId !== undefined) map['Branch_Folder_ID'] = updates.branchFolderId;
  if (updates.evidenceFolderId !== undefined) map['Evidence_Folder_ID'] = updates.evidenceFolderId;
  if (updates.aktif !== undefined) map['Aktif'] = updates.aktif;

  for (const [key, value] of Object.entries(map)) {
    const col = headers.indexOf(key);
    if (col >= 0) {
      cells.push({ row: rowIndex + 2, col, value });
    }
  }
  await writeRegistryCells(registryId, CABANG_SHEET, cells);
  resetRegistryCache();
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

export async function updateCabangFolderId(
  cabangId: string,
  folderId: string
): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetDataRaw(registryId, CABANG_SHEET);
  const branchColumn = headers.indexOf('Cabang_ID');
  const folderColumn = headers.indexOf('Folder_Drive_ID');
  if (branchColumn < 0 || folderColumn < 0) {
    throw new Error('Kolom cabang atau folder tidak ditemukan di Registry');
  }
  const rowIndex = rows.findIndex((row) => asStr(row[branchColumn]) === cabangId);
  if (rowIndex < 0) throw new Error('CABANG_TIDAK_DITEMUKAN: ' + cabangId);
  await writeRegistryCells(registryId, CABANG_SHEET, [
    { row: rowIndex + 2, col: folderColumn, value: folderId },
  ]);
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

// Sheet Users dibaca hampir di setiap request (nama petugas, otorisasi,
// verifikasi PIN admin), jadi hasilnya di-cache dengan TTL + single-flight.
const USERS_CACHE_TTL_MS = 60_000;
let _usersCache: UserRow[] | null = null;
let _usersCacheAt = 0;
let _usersPending: Promise<UserRow[]> | null = null;

/** Buang cache Users dipanggil setiap mutasi pada sheet Users. */
export function resetUsersCache(): void {
  _usersCache = null;
  _usersCacheAt = 0;
  _usersPending = null;
}

async function fetchUsers(): Promise<UserRow[]> {
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

export async function listAllUsers(): Promise<UserRow[]> {
  if (_usersCache && Date.now() - _usersCacheAt < USERS_CACHE_TTL_MS) {
    return _usersCache;
  }
  // Single-flight: request paralel menunggu satu panggilan yang sama
  if (_usersPending) return _usersPending;

  _usersPending = fetchUsers();
  try {
    const users = await _usersPending;
    _usersCache = users;
    _usersCacheAt = Date.now();
    return users;
  } finally {
    _usersPending = null;
  }
}

export async function insertUser(row: UserRow): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  await appendRows(registryId, USERS_SHEET, [
    USER_HEADERS.map((h) => row[h as keyof UserRow] ?? ''),
  ]);
  resetUsersCache();
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
  resetUsersCache();
}

export async function deleteUserRow(rowNumber: number): Promise<void> {
  const registryId = getRegistrySpreadsheetId();
  await deleteSheetRows(registryId, USERS_SHEET, rowNumber);
  resetUsersCache();
}

/** Daftar id cabang yang boleh diakses user (kolom Cabang_ID dipisah koma). */
export function branchIdsOf(user: UserRow): string[] {
  return asStr(user.Cabang_ID)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
