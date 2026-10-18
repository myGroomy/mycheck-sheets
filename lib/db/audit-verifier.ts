import { computeAuditHash } from './audit';
import { asStr, listRows } from '../store';
import { listBranchSheetTitles, readBranchSchemaVersion } from '../schema/version';

export interface AuditVerification { valid: boolean; checked: number; errors: string[]; }

function nullableJson(value: unknown): unknown {
  const raw = asStr(value);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function payload(row: Record<string, unknown>): Record<string, unknown> {
  return {
    at: asStr(row.at), actor_id: asStr(row.actor_id) || null, action: asStr(row.action),
    object_type: asStr(row.object_type) || null, object_id: asStr(row.object_id) || null,
    branch_id: asStr(row.branch_id) || null, shift_instance_id: asStr(row.shift_instance_id) || null,
    before: nullableJson(row.before), after: nullableJson(row.after), reason: asStr(row.reason) || null,
  };
}

export function verifyAuditRows(rows: Record<string, unknown>[], anchor = ''): AuditVerification {
  const errors: string[] = [];
  let previous = anchor;
  rows.forEach((row, index) => {
    const expectedSeq = index + 1;
    if (Number(row.seq) !== expectedSeq) errors.push(`seq tidak berurutan pada index ${index}: ${String(row.seq)}`);
    if (asStr(row.prev_hash) !== previous) errors.push(`prev_hash tidak cocok pada seq ${String(row.seq)}`);
    if (asStr(row.hash) !== computeAuditHash(previous, payload(row))) errors.push(`hash tidak cocok pada seq ${String(row.seq)}`);
    previous = asStr(row.hash);
  });
  return { valid: errors.length === 0, checked: rows.length, errors };
}

export async function verifyCurrentAuditChain(spreadsheetId: string, year: string): Promise<AuditVerification> {
  const { periodMode } = await readBranchSchemaVersion(spreadsheetId);
  const titles = await listBranchSheetTitles(spreadsheetId);
  if (periodMode === 'monthly') {
    const monthlyTitles = titles.filter((title) => new RegExp(`^AuditLog_${year}-\\d{2}$`).test(title)).sort();
    const results = await Promise.all(monthlyTitles.map(async (title) => verifyAuditRows(await listRows(spreadsheetId, title).catch(() => []))));
    return {
      valid: results.every((result) => result.valid),
      checked: results.reduce((total, result) => total + result.checked, 0),
      errors: results.flatMap((result, index) => result.errors.map((error) => `${monthlyTitles[index]}: ${error}`)),
    };
  }
  const auditSheet = periodMode === 'flat' ? 'AuditLog' : `AuditLog_${year}`;
  const rows = await listRows(spreadsheetId, auditSheet).catch(() => []);
  let anchor = '';
  if (periodMode === 'yearly') {
    const priorYears = titles.map((title) => Number(title.match(/^AuditLog_(\d{4})$/)?.[1] ?? 0)).filter((value) => value > 0 && value < Number(year)).sort((a, b) => b - a);
    if (priorYears[0]) {
      const prior = await listRows(spreadsheetId, `AuditLog_${priorYears[0]}`).catch(() => []);
      anchor = asStr(prior.at(-1)?.hash);
    }
  }
  return verifyAuditRows(rows, anchor);
}
