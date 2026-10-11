import { NextRequest, NextResponse } from 'next/server';
import { buildPublicReportDetail } from '@/lib/report-detail';
import { drivePhotoResponse } from '@/lib/google/drive-photo-response';
import { containsPhotoId } from '@/lib/shared/report-values';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const result = await buildPublicReportDetail(token);
  if (result.state !== 'ok') {
    const status = result.state === 'expired' ? 410 : 404;
    const message =
      result.state === 'expired'
        ? 'Token laporan telah kedaluwarsa.'
        : result.state === 'notfound'
          ? 'Laporan tidak ditemukan.'
          : 'Token laporan tidak valid atau sudah dicabut.';
    return NextResponse.json({ error: message }, { status });
  }

  const detail = result.detail;
  const pointRefs = new Set(
    (detail.shift.template_snapshot?.categories ?? []).flatMap((category) =>
      category.points.map((point) => point.point_ref)
    )
  );
  const photo = detail.photos.find((item) => item.id === id && item.status === 'uploaded');
  const attached = photo?.ownerType === 'entry'
    ? pointRefs.has(photo.ownerId) && detail.entries.some(
        (entry) => entry.state === 'selesai' && containsPhotoId(entry.value, id)
      )
    : photo?.ownerType === 'handover'
      ? detail.handover?.id === photo.ownerId && containsPhotoId(detail.handover.values, id)
      : photo?.ownerType === 'incident' && detail.incidents.some((incident) => incident.id === photo.ownerId);
  if (!photo || !attached) {
    return NextResponse.json({ error: 'Lampiran foto tidak ditemukan' }, { status: 404 });
  }

  return drivePhotoResponse(photo.fileRef, photo.mime || 'image/jpeg');
}
