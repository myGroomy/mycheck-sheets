import { NextResponse } from 'next/server';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { resolveInstance } from '../../../../../lib/instance-resolver';
import { flushBufferedShift, isShiftBufferEnabled } from '../../../../../lib/shift-buffer';

export const POST = withAuth(async (req, ctx) => {
  const shiftInstanceId = new URL(req.url).pathname.split('/').slice(-2)[0];
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  const accessError = requireBranchAccess(ctx, resolved.branchId);
  if (accessError) return accessError;
  if (!isShiftBufferEnabled()) return NextResponse.json({ status: 'legacy', actions: 0 });

  try {
    const result = await flushBufferedShift(
      resolved.branchId,
      shiftInstanceId,
      resolved.spreadsheetId,
      resolved.tabMonth,
    );
    return NextResponse.json({ ...result, status: result.status === 'empty' ? 'kosong' : 'tersinkron_sheets' });
  } catch (error) {
    if (error instanceof Error && error.message === 'SHIFT_BUFFER_BUSY') {
      return NextResponse.json({ error: 'Shift sedang disinkronkan.', code: 'SHIFT_BUFFER_BUSY' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Sinkronisasi shift gagal.', code: 'SHIFT_SYNC_FAILED' }, { status: 503 });
  }
});
