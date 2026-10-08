import { NextRequest, NextResponse } from 'next/server';
import {
  withAuth,
  requireBranchAccess,
  requireRole,
  type AuthContext,
} from '../../../../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../../../../lib/google/registry';
import { filterRows, asStr } from '../../../../../../../lib/store';
import {
  listShareTokens,
  rowNumberOfToken,
  updateShareTokenCells,
} from '../../../../../../../lib/google/share-tokens';

export const DELETE = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const pathParts = new URL(req.url).pathname.split('/');
  const reportId = pathParts[pathParts.length - 3];
  const tokenId = pathParts[pathParts.length - 1];

  const roleError = requireRole(ctx, 'admin');
  if (roleError) return roleError;

  const token = (await listShareTokens()).find(
    (t) => t.id === tokenId && t.report_id === reportId
  );
  if (!token) {
    return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 404 });
  }

  // Verifikasi laporan masih ada di cabang yang boleh diakses
  const cabangs = await getCabangList();
  let branchId = '';
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    try {
      const { spreadsheetId } = await resolveCabang(cabang.Cabang_ID);
      const hits = await filterRows(
        spreadsheetId,
        'Reports',
        (r) => asStr(r['id']) === reportId
      );
      if (hits[0]) {
        branchId = cabang.Cabang_ID;
        break;
      }
    } catch {
      // lanjut
    }
  }
  if (!branchId) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });
  }

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  const rowNumber = await rowNumberOfToken(tokenId);
  if (rowNumber == null) {
    return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 404 });
  }

  await updateShareTokenCells(rowNumber, { revoked_at: new Date().toISOString() });

  return NextResponse.json({ status: 'dicabut', token_id: token.id });
});