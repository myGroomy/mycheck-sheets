import { NextResponse } from 'next/server';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { filterRows, listMonthlyRows } from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const pathParts = new URL(_req.url).pathname.split('/');
  const shiftInstanceId = pathParts[pathParts.length - 2];

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, spreadsheetId, branchId } = resolved;

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  const previousShifts = (
    await filterRows(spreadsheetId, 'ShiftInstances', (r) =>
      ['ditutup', 'ditutup_paksa'].includes(String(r['status'])) &&
      String(r['opened_at'] ?? '') < String(instance['opened_at'] ?? '')
    )
  ).sort((a, b) => String(b['opened_at']).localeCompare(String(a['opened_at'])));

  const previousShift = previousShifts[0] ?? null;

  let handover: Record<string, unknown> | null = null;
  if (previousShift) {
    // Shift sebelumnya bisa berada di tab bulanan berbeda
    const prevTabMonth =
      String(previousShift['tab_month'] ?? '').trim() ||
      String(previousShift['shift_date'] ?? '').slice(0, 7);
    const handovers = await listMonthlyRows(spreadsheetId, 'Handovers', prevTabMonth);
    const found = handovers.find(
      (r) => String(r['shift_instance_id']) === String(previousShift['id'])
    );
    if (found) {
      let values: unknown = null;
      try {
        values = JSON.parse(String(found['values'] ?? 'null'));
      } catch {
        values = null;
      }
      handover = {
        id: found['id'],
        values,
        freeText: found['free_text'],
        submittedBy: found['submitted_by'],
        submittedAt: found['submitted_at'],
      };
    }
  }

  return NextResponse.json({
    shift_instance_id: previousShift ? previousShift['id'] : null,
    handover,
  });
});