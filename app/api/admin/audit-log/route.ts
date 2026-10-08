import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { resolveCabang } from '../../../../lib/google/registry';
import { listAllCabang } from '../../../../lib/google/registry-admin';
import { listAllUsers } from '../../../../lib/google/registry-admin';
import { listMonthlyRows } from '../../../../lib/store';
import { asJson, asNum, asStr } from '../../../../lib/store';

/** Nama tab AuditLog yang ada di spreadsheet cabang. */
async function auditTabs(spreadsheetId: string): Promise<string[]> {
  const { getSheetsClient } = await import('../../../../lib/google/client');
  const meta = await getSheetsClient().spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  return (meta.data.sheets || [])
    .map((s) => s.properties?.title ?? '')
    .filter((t) => /^AuditLog_\d{4}-\d{2}$/.test(t));
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const { searchParams } = new URL(req.url);
  const actorId = searchParams.get('actorId');
  const action = searchParams.get('action');
  const branchId = searchParams.get('branchId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam ? parseInt(cursorParam, 10) : null;

  // Peta lookup nama
  const cabangs = await listAllCabang();
  const branchNames = new Map(cabangs.map((c) => [c.Cabang_ID, c.Nama_Cabang]));
  const users = await listAllUsers();
  const userByName = new Map(users.map((u) => [u.Username, u]));

  const targets = branchId
    ? [branchId]
    : cabangs.filter((c) => c.Aktif).map((c) => c.Cabang_ID);

  const collected: {
    seq: number;
    row: Record<string, unknown>;
    branchId: string;
  }[] = [];

  for (const target of targets) {
    if (!ctx.branchIds.includes(target)) continue;
    let spreadsheetId = '';
    try {
      const resolved = await resolveCabang(target);
      spreadsheetId = resolved.spreadsheetId;
    } catch {
      continue;
    }

    for (const tab of await auditTabs(spreadsheetId)) {
      const rows = await listMonthlyRows(spreadsheetId, 'AuditLog', tab.slice(-7));
      for (const row of rows) {
        if (actorId && asStr(row['actor_id']) !== actorId) continue;
        if (action && asStr(row['action']) !== action) continue;
        const branchInRow = asStr(row['branch_id']);
        if (branchId && branchInRow !== branchId) continue;
        const at = asStr(row['at']);
        if (from && at < from) continue;
        if (to && at > to) continue;
        const seq = asNum(row['seq']) ?? 0;
        if (cursor !== null && !Number.isNaN(cursor) && seq >= cursor) continue;
        collected.push({ seq, row, branchId: branchInRow || target });
      }
    }
  }

  collected.sort((a, b) => b.seq - a.seq);
  const page = collected.slice(0, limit);

  const logs = page.map(({ row, branchId: rowBranch }) => {
    const actorUsername = asStr(row['actor_id']);
    const actor = userByName.get(actorUsername);
    return {
      id: asStr(row['id']),
      seq: asNum(row['seq']) ?? 0,
      at: asStr(row['at']),
      actorId: asStr(row['actor_id']) || null,
      actorName: actor?.Nama ?? null,
      actorUsername,
      action: asStr(row['action']),
      objectType: asStr(row['object_type']) || null,
      objectId: asStr(row['object_id']) || null,
      branchId: rowBranch || null,
      branchName: branchNames.get(rowBranch) ?? rowBranch ?? null,
      shiftInstanceId: asStr(row['shift_instance_id']) || null,
      reason: asStr(row['reason']) || null,
      before: asJson<Record<string, unknown>>(row['before']),
      after: asJson<Record<string, unknown>>(row['after']),
      hash: asStr(row['hash']) || null,
      prevHash: asStr(row['prev_hash']) || null,
    };
  });

  const nextCursor = collected.length > limit ? page[page.length - 1]?.seq ?? null : null;

  return NextResponse.json({ logs, nextCursor });
});