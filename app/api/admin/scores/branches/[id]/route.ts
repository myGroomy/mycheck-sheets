import { NextResponse } from 'next/server';
import { withAuth, requireBranchAccess } from '@/lib/api-auth';
import { getBranchScoresSummary } from '@/lib/admin/scoring-service';

export const GET = withAuth(async (req, ctx, _session) => {
  const branchId = new URL(req.url).pathname.split('/').at(-2) ?? '';
  const branchErr = requireBranchAccess(ctx, branchId);
  if (branchErr) return branchErr;

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get('dateFrom') || undefined;
  const dateTo = url.searchParams.get('dateTo') || undefined;

  const summaries = await getBranchScoresSummary({ branchId, dateFrom, dateTo }, [branchId]);
  const detail = summaries[0] || { branchId, shiftsCompleted: 0, weightedScore: 0, averageScore: 0 };

  return NextResponse.json({ branch: detail });
});
