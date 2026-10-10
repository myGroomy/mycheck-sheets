// lib/db/audit.ts
// Append audit log dengan hash chain VERSION Google Sheets + tab bulanan.
import { createHash } from 'crypto';
import { ulid } from 'ulid';
import { ensureMonthlySheet, insertRow, listMonthlyRows, asStr } from '../store';

interface AuditEntry {
  actorId: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  branchId?: string;
  shiftInstanceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

function computeHash(prevHash: string, entry: Record<string, unknown>): string {
  const canonical = JSON.stringify(entry);
  return createHash('sha256').update(prevHash + '|' + canonical).digest('hex');
}

/** Append audit log ke sheet AuditLog_<YYYY-MM> cabang. */
export async function appendAuditLogFor(spreadsheetId: string, entry: AuditEntry): Promise<void> {
  const tabMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const tab = await ensureMonthlySheet(spreadsheetId, 'AuditLog', tabMonth);
  const rows = await listMonthlyRows(spreadsheetId, 'AuditLog', tabMonth);
  const last = rows[rows.length - 1];
  const prevHash = last ? asStr(last['hash']) : '';
  const seq = rows.length + 1;

  const at = new Date();
  const payload = {
    at: at.toISOString(),
    actor_id: entry.actorId,
    action: entry.action,
    object_type: entry.objectType ?? null,
    object_id: entry.objectId ?? null,
    branch_id: entry.branchId ?? null,
    shift_instance_id: entry.shiftInstanceId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  };
  const hash = computeHash(prevHash, payload);

  await insertRow(spreadsheetId, tab, {
    id: ulid(),
    seq,
    ...payload,
    before: entry.before ? JSON.stringify(entry.before) : '',
    after: entry.after ? JSON.stringify(entry.after) : '',
    prev_hash: prevHash,
    hash,
  });
}

/** Kompatibilitas lama */
export async function appendAuditLog(spreadsheetIdOrTx: string, entry: AuditEntry): Promise<void> {
  return appendAuditLogFor(spreadsheetIdOrTx, entry);
}
