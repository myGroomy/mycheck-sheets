import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '@/lib/api-auth';
import { buildAdminStats } from '@/lib/admin/stats-service';

export const GET = withAuth(async (_req, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  return NextResponse.json(await buildAdminStats(ctx));
});