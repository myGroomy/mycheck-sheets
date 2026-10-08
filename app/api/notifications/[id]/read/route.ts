// app/api/notifications/[id]/read/route.ts — Phase 4 (Sheets). Idempotent.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../../lib/google/registry';
import { asStr, listRowsWithNumber, updateRow } from '../../../../../lib/store';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const notificationId = new URL(req.url).pathname.split('/').slice(-2)[0];
  const cabangs = await getCabangList();
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try { spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId; } catch { continue; }
    let numbered: Awaited<ReturnType<typeof listRowsWithNumber>> = [];
    try { numbered = await listRowsWithNumber(spreadsheetId, 'Notifications'); } catch { continue; }
    const hit = numbered.find((r) => asStr(r.data['id']) === notificationId && asStr(r.data['user_id']) === ctx.user.id);
    if (hit) {
      await updateRow(spreadsheetId, 'Notifications', hit.rowNumber, { is_read: true });
      return NextResponse.json({ status: 'dibaca', notification_id: notificationId });
    }
  }
  return NextResponse.json({ error: 'Notifikasi tidak ditemukan' }, { status: 404 });
});
