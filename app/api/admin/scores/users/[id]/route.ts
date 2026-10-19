import { NextResponse } from 'next/server';
import { withAuth, requireRole } from '@/lib/api-auth';
import { getUserScoresSummary } from '@/lib/admin/scoring-service';

export const GET = withAuth(async (req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const userId = new URL(req.url).pathname.split('/').at(-2) ?? '';
  const url = new URL(req.url);
  const branchId = url.searchParams.get('branchId') || undefined;

  const allowedBranchIds = branchId ? [branchId].filter((id) => ctx.branchIds.includes(id)) : ctx.branchIds;
  const summaries = await getUserScoresSummary({ branchId, userId }, allowedBranchIds);
  const detail = summaries[0] || { userId, pjScore: null, actionScore: null, userTotalScore: null, shiftsPjCount: 0, actionContributionsCount: 0, incidentPenaltyTotal: 0 };

  return NextResponse.json({ user: detail });
});
