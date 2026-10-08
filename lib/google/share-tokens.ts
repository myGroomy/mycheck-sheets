// lib/google/share-tokens.ts
// CRUD share token laporan publik pada sheet `Share_Tokens` di Registry.
//
// Token disimpan di Registry (bukan per cabang) supaya pencarian token pada
// route publik hanya butuh satu pembacaan.

import { randomBytes } from 'crypto';
import { readSheetData, sheetToObjects, writeCells, appendRows } from './sheets';
import { getRegistrySpreadsheetId } from './registry';
import { columnIndexToLetter } from './sheets';
import { asNum, asStr } from '../store';

const SHEET = 'Share_Tokens';

export const SHARE_HEADERS = [
  'id',
  'report_id',
  'branch_id',
  'token',
  'created_by',
  'created_at',
  'expires_at',
  'revoked_at',
  'access_count',
  'last_accessed_at',
  'share_note',
  'visibility',
];

export interface ShareTokenRow {
  id: string;
  report_id: string;
  branch_id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string;
  access_count: string | number;
  last_accessed_at: string;
  share_note: string;
  visibility: string;
  rowNumber?: number;
}

/** Token publik = base64url acak 24 karakter; disimpan apa adanya di sheet. */
export function generateToken(): string {
  return randomBytes(18).toString('base64url').slice(0, 24);
}

function normalize(r: Record<string, unknown>): ShareTokenRow {
  return {
    id: asStr(r['id']),
    report_id: asStr(r['report_id']),
    branch_id: asStr(r['branch_id']),
    token: asStr(r['token']),
    created_by: asStr(r['created_by']),
    created_at: asStr(r['created_at']),
    expires_at: asStr(r['expires_at']),
    revoked_at: asStr(r['revoked_at']),
    access_count: asNum(r['access_count']) ?? 0,
    last_accessed_at: asStr(r['last_accessed_at']),
    share_note: asStr(r['share_note']),
    visibility: asStr(r['visibility']),
  };
}

export async function listShareTokens(): Promise<ShareTokenRow[]> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, SHEET);
  return (sheetToObjects(headers, rows) as Record<string, unknown>[]).map(normalize);
}

/** Token milik sebuah laporan, belum dicabut. */
export async function listTokensForReport(
  reportId: string
): Promise<ShareTokenRow[]> {
  return (await listShareTokens()).filter(
    (t) => t.report_id === reportId && !t.revoked_at
  );
}

export async function findTokenByValue(token: string): Promise<ShareTokenRow | null> {
  const list = await listShareTokens();
  return list.find((t) => t.token === token) ?? null;
}

export async function insertShareToken(row: ShareTokenRow): Promise<void> {
  await appendRows(getRegistrySpreadsheetId(), SHEET, [
    SHARE_HEADERS.map((h) => (row[h as keyof ShareTokenRow] ?? '') as string),
  ]);
}

/** Perbarui beberapa kolom pada baris token. */
export async function updateShareTokenCells(
  rowNumber: number,
  updates: Partial<ShareTokenRow>
): Promise<void> {
  const cells = Object.entries(updates).map(([key, value]) => {
    const col = SHARE_HEADERS.indexOf(key);
    if (col === -1) throw new Error(`Kolom ${key} tidak dikenal di ${SHEET}`);
    return { range: `${SHEET}!${columnIndexToLetter(col)}${rowNumber}`, value };
  });
  await writeCells(getRegistrySpreadsheetId(), cells);
}

/** Nomor baris fisik token untuk operasi update/revoke. */
export async function rowNumberOfToken(tokenId: string): Promise<number | null> {
  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetData(registryId, SHEET);
  const list = sheetToObjects(headers, rows) as Record<string, unknown>[];
  for (let i = 0; i < list.length; i++) {
    if (asStr(list[i]['id']) === tokenId) return i + 2; // +2: header + basis 1
  }
  return null;
}

/** Token aktif? (belum dicabut dan belum kedaluwarsa) */
export function isTokenActive(t: ShareTokenRow, now = new Date()): boolean {
  if (t.revoked_at) return false;
  if (!t.expires_at) return true;
  return new Date(t.expires_at).getTime() > now.getTime();
}