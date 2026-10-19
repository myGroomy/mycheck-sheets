import { NextResponse } from 'next/server';
import { withAuth, requireRole } from '@/lib/api-auth';
import { getBranchScoresSummary } from '@/lib/admin/scoring-service';

export const GET = withAuth(async (req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branchId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') || undefined;
  const dateTo = url.searchParams.get('dateTo') || undefined;

  const allowedBranchIds = branchId ? [branchId].filter((id) => ctx.branchIds.includes(id)) : ctx.branchIds;
  const summaries = await getBranchScoresSummary({ branchId, dateFrom, dateTo }, allowedBranchIds);

  return NextResponse.json({ branches: summaries });
});
