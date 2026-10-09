// app/api/notifications/route.ts — Phase 4 (Sheets).
// GET 50 notifikasi terbaru user dari sheet statis Notifications per cabang.
import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../lib/google/registry';
import { asStr, filterRows } from '../../../lib/store';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const cabangs = await getCabangList();
  const items: { id: string; type: string; payload: unknown; read_at: string | null; created_at: string }[] = [];
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try { spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId; } catch { continue; }
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await filterRows(spreadsheetId, 'Notifications', (r) => asStr(r['user_id']) === ctx.user.id);
    } catch { continue; }
    for (const r of rows) {
      const readRaw = asStr(r['is_read']);
      const isRead = readRaw.toLowerCase() === 'true' || readRaw === '1';
      const createdAt = asStr(r['created_at']);
      items.push({
        id: asStr(r['id']), type: asStr(r['type']),
        payload: { title: asStr(r['title']), body: asStr(r['body']), link: asStr(r['link']) || null },
        read_at: isRead ? createdAt : null,
        created_at: createdAt,
      });
    }
  }
  items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ items: items.slice(0, 50) });
});
