// app/api/admin/shift-instances/route.ts daftar shift instance lintas cabang
// untuk modul admin "Operasi Shift" (ADM-OP-01).
import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { listShiftInstancesAcrossBranches } from '../../../../lib/admin/shift-operations';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  // Default 'berjalan' ADM-OP-01 hanya meminta shift yang sedang berjalan.
  const status = new URL(_req.url).searchParams.get('status') ?? 'berjalan';
  const allowed = ['berjalan', 'ditutup', 'void'];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `status harus salah satu dari: ${allowed.join(', ')}` },
      { status: 400 }
    );
  }

  const instances = await listShiftInstancesAcrossBranches(ctx, status);
  return NextResponse.json({ status, instances });
});