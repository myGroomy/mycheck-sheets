import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '@/lib/api-auth';
import { buildAdminStats } from '@/lib/admin/stats-service';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  return NextResponse.json(await buildAdminStats(ctx));
});