import { NextResponse } from 'next/server';
import { withAuth } from '../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../lib/google/registry';
import { listMonthlyRows, listPeriodKeys, asStr } from '../../../../lib/store';
import { buildReportDetail } from '../../../../lib/report-detail';
import { drivePhotoResponse } from '../../../../lib/google/drive-photo-response';
import { containsPhotoId } from '../../../../lib/shared/report-values';

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
  const photoId = new URL(_req.url).pathname.split('/').at(-1) ?? '';
  const reportId = new URL(_req.url).searchParams.get('reportId');

  if (reportId) {
    for (const branchId of ctx.branchIds) {
      let spreadsheetId = '';
      try {
        spreadsheetId = (await resolveCabang(branchId)).spreadsheetId;
      } catch {
        continue;
      }
      const detail = await buildReportDetail(spreadsheetId, branchId, reportId);
      if (!detail) continue;
      const photo = detail.photos.find((item) => item.id === photoId && item.status === 'uploaded');
      const pointRefs = new Set(
        (detail.shift.template_snapshot?.categories ?? []).flatMap((category) =>
          category.points.map((point) => point.point_ref)
        )
      );
      const attached = photo?.ownerType === 'entry'
        ? pointRefs.has(photo.ownerId) && detail.entries.some(
            (entry) => entry.state === 'selesai' && containsPhotoId(entry.value, photoId)
          )
        : photo?.ownerType === 'handover'
          ? detail.handover?.id === photo.ownerId && containsPhotoId(detail.handover.values, photoId)
          : photo?.ownerType === 'incident' && detail.incidents.some((incident) => incident.id === photo.ownerId);
      if (!photo || !attached) continue;
      return drivePhotoResponse(photo.fileRef, photo.mime || 'image/jpeg');
    }
    return NextResponse.json({ error: 'Lampiran foto tidak ditemukan' }, { status: 404 });
  }

  const cabangs = await getCabangList();
  let located: {
    spreadsheetId: string;
    branchId: string;
    fileRef: string;
    mime: string;
  } | null = null;

  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }
    for (const month of await listPeriodKeys(spreadsheetId, 'Photos')) {
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

  return drivePhotoResponse(located.fileRef, located.mime);
});
