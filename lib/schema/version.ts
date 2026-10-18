import { readSheetData, listSheetTitles } from '../google/sheets';
import type { PeriodMode } from './registry';

export interface BranchSchemaVersion { schemaVersion: number; periodMode: PeriodMode; }
const cache = new Map<string, { value: BranchSchemaVersion; expiresAt: number }>();
const TTL_MS = 60_000;

export async function readBranchSchemaVersion(spreadsheetId: string): Promise<BranchSchemaVersion> {
  const hit = cache.get(spreadsheetId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  try {
    const { headers, rows } = await readSheetData(spreadsheetId, '_meta');
    const keyIndex = headers.indexOf('key');
    const valueIndex = headers.indexOf('value');
    const values = new Map(rows.map((row) => [String(row[keyIndex] ?? ''), String(row[valueIndex] ?? '')]));
    const parsedVersion = Number(values.get('schema_version') || '1');
    const value: BranchSchemaVersion = {
      schemaVersion: Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1,
      periodMode: values.get('period_mode') === 'yearly' ? 'yearly' : values.get('period_mode') === 'flat' ? 'flat' : 'monthly',
    };
    cache.set(spreadsheetId, { value, expiresAt: Date.now() + TTL_MS });
    if (!values.has('schema_version')) console.warn(`[schema] ${spreadsheetId}: schema_version kosong, memakai v1`);
    return value;
  } catch {
    return { schemaVersion: 1, periodMode: 'monthly' };
  }
}

export function invalidateBranchSchemaVersion(spreadsheetId?: string): void {
  if (!spreadsheetId) cache.clear(); else cache.delete(spreadsheetId);
}

export async function listBranchSheetTitles(spreadsheetId: string): Promise<string[]> {
  return listSheetTitles(spreadsheetId);
}
