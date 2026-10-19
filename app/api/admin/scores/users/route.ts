import { NextResponse } from 'next/server';
import { withAuth, requireRole } from '@/lib/api-auth';
import { getUserScoresSummary } from '@/lib/admin/scoring-service';

export const GET = withAuth(async (req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branchId') || undefined;
  const userId = url.searchParams.get('userId') || undefined;

  const allowedBranchIds = branchId ? [branchId].filter((id) => ctx.branchIds.includes(id)) : ctx.branchIds;
  const summaries = await getUserScoresSummary({ branchId, userId }, allowedBranchIds);

  return NextResponse.json({ users: summaries });
});
