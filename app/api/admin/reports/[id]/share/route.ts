import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import {
  withAuth,
  requireBranchAccess,
  requireRole,
  type AuthContext,
} from '../../../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../../../lib/google/registry';
import { filterRows, asStr } from '../../../../../../lib/store';
import {
  generateToken,
  insertShareToken,
  isTokenActive,
  listTokensForReport,
} from '../../../../../../lib/google/share-tokens';

/** Cari laporan + cabangnya di cabang yang diakses user. */
async function locateReport(
  ctx: AuthContext,
  reportId: string
): Promise<{ spreadsheetId: string; branchId: string } | null> {
  const cabangs = await getCabangList();
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    try {
      const { spreadsheetId } = await resolveCabang(cabang.Cabang_ID);
      const hits = await filterRows(
        spreadsheetId,
        'Reports',
        (r) => asStr(r['id']) === reportId
      );
      if (hits[0]) return { spreadsheetId, branchId: cabang.Cabang_ID };
    } catch {
      // lanjut
    }
  }
  return null;
}

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const reportId = new URL(_req.url).pathname.split('/').slice(-2)[0];
  const roleError = requireRole(ctx, 'admin');
  if (roleError) return roleError;

  const located = await locateReport(ctx, reportId);
  if (!located) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });

  const branchAccessError = requireBranchAccess(ctx, located.branchId);
  if (branchAccessError) return branchAccessError;

  const tokens = await listTokensForReport(reportId);
  tokens.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      expires_at: t.expires_at,
      expired: !isTokenActive(t),
      created_at: t.created_at,
    })),
  });
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const reportId = new URL(_req.url).pathname.split('/').slice(-2)[0];
  const roleError = requireRole(ctx, 'admin');
  if (roleError) return roleError;

  let body: { expiresHours?: number; note?: string } = {};
  try {
    body = (await _req.json()) as { expiresHours?: number; note?: string };
  } catch {
    body = {};
  }

  const expiresHours = Math.max(Number(body.expiresHours ?? 168), 1);

  const located = await locateReport(ctx, reportId);
  if (!located) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });

  const branchAccessError = requireBranchAccess(ctx, located.branchId);
  if (branchAccessError) return branchAccessError;

  const token = generateToken();
  const tokenId = ulid();
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

  await insertShareToken({
    id: tokenId,
    report_id: reportId,
    branch_id: located.branchId,
    token,
    created_by: ctx.user.id,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    revoked_at: '',
    access_count: 0,
    last_accessed_at: '',
    share_note: body.note ?? '',
    visibility: 'read',
  });

  return NextResponse.json({
    status: 'dibuat',
    token_id: tokenId,
    token,
    expires_at: expiresAt.toISOString(),
  });
});