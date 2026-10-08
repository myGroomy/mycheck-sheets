import { NextRequest, NextResponse } from 'next/server';
import { withAuth, requireBranchAccess, type AuthContext } from '../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../lib/google/registry';
import { filterRows, asStr } from '../../../../lib/store';
import { buildReportDetail } from '../../../../lib/report-detail';

/** Cari laporan (Reports) pada cabang yang diakses user. */
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

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const reportId = new URL(req.url).pathname.split('/').at(-1) ?? '';

  const located = await locateReport(ctx, reportId);
  if (!located) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });
  }

  const branchAccessError = requireBranchAccess(ctx, located.branchId);
  if (branchAccessError) return branchAccessError;

  const detail = await buildReportDetail(
    located.spreadsheetId,
    located.branchId,
    reportId
  );
  if (!detail) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });
  }

  const response = NextResponse.json({
    report: {
      ...detail.report,
      // Kolom arsip PDF tidak ada di template — null agar frontend aman
      archive_pdf_drive_url: null,
      archived_photo_count: null,
    },
    shift: {
      ...detail.shift,
      branch_id: detail.branch.id,
      branch_name: detail.branch.name,
      branch_code: detail.branch.code,
    },
    handover: detail.handover,
    incidents: detail.incidents,
    photos: detail.photos,
    entries: detail.entries,
    participants: detail.participants,
    addenda: detail.addenda,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
});