// tests/helpers/audit-reader.ts
// Membaca tab AuditLog bulanan dari fake workbook untuk memeriksa audit trail.

import { DEFAULT_SPREADSHEET_ID, getSheet, type FakeWorkbook } from './fake-sheets';

export interface AuditRow {
  seq: number;
  action: string;
  object_type: string;
  object_id: string;
  actor_id: string;
  branch_id: string;
  before: string;
  after: string;
  prev_hash: string;
  hash: string;
}

const AUDIT_HEADERS = [
  'id',
  'seq',
  'at',
  'actor_id',
  'action',
  'object_type',
  'object_id',
  'branch_id',
  'shift_instance_id',
  'before',
  'after',
  'reason',
  'prev_hash',
  'hash',
];

/** Baris audit pada bulan tertentu (default bulan berjalan). */
export function readAuditLog(
  workbook: FakeWorkbook,
  month = new Date().toISOString().slice(0, 7),
  spreadsheetId = DEFAULT_SPREADSHEET_ID
): AuditRow[] {
  const sheet = getSheet(workbook, `AuditLog_${month}`, spreadsheetId);
  if (!sheet) return [];
  return sheet.values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    AUDIT_HEADERS.forEach((header, index) => {
      obj[header] = String(row[index] ?? '');
    });
    return obj as unknown as AuditRow;
  });
}