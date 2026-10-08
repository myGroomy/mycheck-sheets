// app/api/handovers/[id]/ack/route.ts — Phase 4 (Sheets).
// Tandai handover shift sebelumnya sebagai sudah dibaca (idempotent).
import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { ensureMonthlySheet, insertRow, listMonthlyRows } from '../../../../../lib/store';
import { asStr } from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const handoverId = new URL(req.url).pathname.split('/').slice(-2)[0];
  let body: { shift_instance_id?: string } = {};
  try { body = (await req.json()) as { shift_instance_id?: string }; } catch { /* kosong */ }
  // Cari handover di semua cabang yang bisa diakses (3 bulan terakhir)
  const months: string[] = [];
  for (let back = 0; back < 3; back++) {
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    months.push(d.toISOString().slice(0, 7));
  }
  let found: { spreadsheetId: string; branchId: string; tabMonth: string; handover: Record<string, unknown> } | null = null;
  const { getCabangList } = await import('../../../../../lib/google/registry');
  const { resolveCabang } = await import('../../../../../lib/google/registry');
  for (const cabang of await getCabangList()) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try { spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId; } catch { continue; }
    for (const month of months) {
      const rows = await listMonthlyRows(spreadsheetId, 'Handovers', month);
      const h = rows.find((r) => asStr(r['id']) === handoverId);
      if (h) { found = { spreadsheetId, branchId: cabang.Cabang_ID, tabMonth: month, handover: h }; break; }
    }
    if (found) break;
  }
  if (!found) return NextResponse.json({ error: 'Handover tidak ditemukan' }, { status: 404 });
  const branchAccessError = requireBranchAccess(ctx, found.branchId);
  if (branchAccessError) return branchAccessError;
  const handoverShiftId = asStr(found.handover['shift_instance_id']);
  const readingShiftInstanceId = body.shift_instance_id ?? handoverShiftId;
  // Validasi shift pembaca bila diberikan eksplisit
  if (body.shift_instance_id) {
    const reading = await resolveInstance(ctx, body.shift_instance_id);
    if (!reading) return NextResponse.json({ error: 'Shift pembaca tidak ditemukan' }, { status: 404 });
  }
  const acksTab = await ensureMonthlySheet(found.spreadsheetId, 'HandoverAcks', found.tabMonth);
  const acks = await listMonthlyRows(found.spreadsheetId, 'HandoverAcks', found.tabMonth);
  const existing = acks.find((a) =>
    asStr(a['handover_id']) === handoverId &&
    asStr(a['reading_shift_instance_id']) === readingShiftInstanceId &&
    asStr(a['user_id']) === ctx.user.id
  );
  if (existing) return NextResponse.json({ status: 'sudah_dibaca', handover_id: handoverId });
  const now = new Date().toISOString();
  await insertRow(found.spreadsheetId, acksTab, {
    id: ulid(), handover_id: handoverId, reading_shift_instance_id: readingShiftInstanceId,
    user_id: ctx.user.id, read_at: now, created_at: now,
  });
  await appendAuditLogFor(found.spreadsheetId, {
    actorId: ctx.user.id, action: 'ack_handover', objectType: 'handover', objectId: handoverId,
    branchId: found.branchId, shiftInstanceId: handoverShiftId || undefined,
    after: { readingShiftInstanceId },
  });
  return NextResponse.json({ status: 'dibaca', handover_id: handoverId });
});
