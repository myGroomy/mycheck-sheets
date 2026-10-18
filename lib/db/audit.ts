// lib/db/audit.ts
// Append audit log dengan hash chain Google Sheets per periode.
import { createHash } from 'crypto';
import { ulid } from 'ulid';
import { ensurePeriodSheet, getPeriodSheet, insertRow, listRows, asStr } from '../store';
import { periodOf } from '../schema/periods';
import { listBranchSheetTitles, readBranchSchemaVersion } from '../schema/version';

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
  timezone?: string;
}

export function computeAuditHash(prevHash: string, entry: Record<string, unknown>): string {
  const canonical = JSON.stringify(entry);
  return createHash('sha256').update(prevHash + '|' + canonical).digest('hex');
}

/** Append audit log ke sheet AuditLog_<YYYY-MM> cabang. */
export async function appendAuditLogFor(spreadsheetId: string, entry: AuditEntry): Promise<void> {
  const { periodMode } = await readBranchSchemaVersion(spreadsheetId);
  const tabMonth = periodOf(new Date(), entry.timezone ?? 'Asia/Jakarta').tabMonth;
  const tab = await ensurePeriodSheet(spreadsheetId, 'AuditLog', tabMonth);
  const rows = await listRows(spreadsheetId, await getPeriodSheet(spreadsheetId, 'AuditLog', tabMonth));
  const last = rows[rows.length - 1];
  const prevHash = last ? asStr(last['hash']) : periodMode === 'yearly' ? await previousAuditHash(spreadsheetId, tabMonth) : '';
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
  const hash = computeAuditHash(prevHash, payload);

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

async function previousAuditHash(spreadsheetId: string, tabMonth: string): Promise<string> {
  const year = Number(tabMonth.slice(0, 4));
  const titles = await listBranchSheetTitles(spreadsheetId);
  const priorYears = titles
    .map((title) => Number(title.match(/^AuditLog_(\d{4})$/)?.[1] ?? 0))
    .filter((value) => value > 0 && value < year)
    .sort((a, b) => b - a);
  for (const priorYear of priorYears) {
    const rows = await listRows(spreadsheetId, `AuditLog_${priorYear}`).catch(() => []);
    const hash = asStr(rows.at(-1)?.hash);
    if (hash) return hash;
  }
  return '';
}

/** Kompatibilitas lama */
export async function appendAuditLog(spreadsheetIdOrTx: string, entry: AuditEntry): Promise<void> {
  return appendAuditLogFor(spreadsheetIdOrTx, entry);
}
