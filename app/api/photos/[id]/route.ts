import { NextResponse } from 'next/server';
import { withAuth } from '../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../lib/google/registry';
import { getDriveClient } from '../../../../lib/google/client';
import { listMonthlyRows, asStr } from '../../../../lib/store';

/**
 * Sajikan foto.
 *
 * Foto disimpan di Drive milik service account sehingga tidak bisa dibuat
 * publik. Alih-alih signed URL, route ini mem-proxy byte dari Drive setelah
 * memeriksa hak akses URL tetap berada di balik autentikasi.
 */
export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const photoId = new URL(_req.url).pathname.split('/').slice(-2)[0];

  const cabangs = await getCabangList();
  let located: {
    spreadsheetId: string;
    branchId: string;
    fileRef: string;
    mime: string;
  } | null = null;

  // Foto di tab bulan berjalan / bulan sebelumnya
  const candidateMonths: string[] = [];
  for (let back = 0; back < 3; back++) {
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    candidateMonths.push(d.toISOString().slice(0, 7));
  }

  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }
    for (const month of candidateMonths) {
      const rows = await listMonthlyRows(spreadsheetId, 'Photos', month);
      const hit = rows.find((p) => asStr(p['id']) === photoId);
      if (hit) {
        located = {
          spreadsheetId,
          branchId: cabang.Cabang_ID,
          fileRef: asStr(hit['file_ref']),
          mime: asStr(hit['mime']) || 'image/jpeg',
        };
        break;
      }
    }
    if (located) break;
  }

  if (!located) {
    return NextResponse.json({ error: 'Foto tidak ditemukan' }, { status: 404 });
  }

  if (!located.fileRef) {
    return NextResponse.json({ error: 'File foto tidak tersimpan' }, { status: 404 });
  }

  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId: located.fileRef, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  const data = res.data as unknown as ArrayBuffer;
  const bytes = Buffer.from(data);

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': located.mime,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
      Vary: 'Cookie',
    },
  });
});