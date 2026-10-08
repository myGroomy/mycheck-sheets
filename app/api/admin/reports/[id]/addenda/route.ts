import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { withAuth, requireBranchAccess, requireRole, type AuthContext } from '../../../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../../../lib/google/registry';
import { filterRows, insertRow, asStr } from '../../../../../../lib/store';
import { appendAuditLogFor } from '../../../../../../lib/db/audit';

/** Tambah addendum (catatan revisi) pada sebuah laporan. */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const reportId = new URL(req.url).pathname.split('/').slice(-2)[0];
  const roleError = requireRole(ctx, 'admin');
  if (roleError) return roleError;

  let body: { note?: string } = {};
  try {
    body = (await req.json()) as { note?: string };
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const note = body.note?.trim();
  if (!note) {
    return NextResponse.json({ error: 'note wajib diisi' }, { status: 400 });
  }

  // Laporan disimpan di spreadsheet cabang, jadi nalei per cabang
  const cabangs = await getCabangList();
  let found: {
    spreadsheetId: string;
    branchId: string;
    report: Record<string, unknown>;
  } | null = null;

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
        found = { spreadsheetId, branchId: cabang.Cabang_ID, report: hits[0] };
        break;
      }
    } catch {
      // lanjut
    }
  }

  if (!found) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });
  }

  const branchAccessError = requireBranchAccess(ctx, found.branchId);
  if (branchAccessError) return branchAccessError;

  const shiftInstanceId = asStr(found.report['shift_instance_id']);
  const id = ulid();

  await insertRow(found.spreadsheetId, 'Addenda', {
    id,
    report_id: reportId,
    author_id: ctx.user.id,
    note,
    created_at: new Date().toISOString(),
  });

  await appendAuditLogFor(found.spreadsheetId, {
    actorId: ctx.user.id,
    action: 'addendum_report',
    objectType: 'report',
    objectId: reportId,
    branchId: found.branchId,
    shiftInstanceId: shiftInstanceId || undefined,
    after: { note },
  });

  return NextResponse.json({ status: 'dibuat', addendum_id: id });
});