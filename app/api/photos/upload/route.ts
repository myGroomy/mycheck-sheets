import { PassThrough } from 'stream';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { withAuth } from '../../../../lib/api-auth';
import { resolveInstance } from '../../../../lib/instance-resolver';
import { resolveCabang } from '../../../../lib/google/registry';
import {
  ensureMonthlySheet,
  filterRows,
  insertRow,
  listMonthlyRows,
} from '../../../../lib/store';
import { asStr } from '../../../../lib/store';
import { getDriveClient } from '../../../../lib/google/client';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_INCIDENT_PHOTOS = 5;

function extensionFor(mime: string): string | null {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return null;
}

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const formData = await _req.formData();
  const file = formData.get('file');
  const ownerType = String(formData.get('ownerType') ?? 'incident');
  const ownerId = String(formData.get('ownerId') ?? '');
  const shiftInstanceId = formData.get('shiftInstanceId')?.toString() || null;

  if (!(file instanceof File) || !ownerId) {
    return NextResponse.json({ error: 'file dan ownerId wajib diisi' }, { status: 400 });
  }
  if (ownerType !== 'entry' && ownerType !== 'handover' && ownerType !== 'incident') {
    return NextResponse.json({ error: 'Jenis pemilik foto tidak valid.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File harus berupa gambar.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Ukuran foto maksimal 5 MB.' }, { status: 400 });
  }

  const ext = extensionFor(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: 'Format foto yang didukung: WebP, PNG, JPEG.' },
      { status: 400 }
    );
  }

  // Incident boleh berada di luar shift berjalan
  let resolvedShiftId = shiftInstanceId;
  let spreadsheetId = '';
  let branchId = '';
  let tabMonth = new Date().toISOString().slice(0, 7);

  if (ownerType === 'incident') {
    let found = false;
    for (const candidate of ctx.branchIds) {
      try {
        const resolved = await resolveCabang(candidate);
        const rows = await filterRows(
          resolved.spreadsheetId,
          'IncidentIndex',
          (r) => asStr(r['incident_id']) === ownerId
        );
        if (rows[0]) {
          spreadsheetId = resolved.spreadsheetId;
          branchId = candidate;
          resolvedShiftId = asStr(rows[0]['shift_instance_id']) || null;
          tabMonth = asStr(rows[0]['tab_month']) || tabMonth;
          found = true;
          break;
        }
        // Incident mungkin belum terindeks — cari di tab bulanan
        const tabs = await listMonthlyRows(
          resolved.spreadsheetId,
          'Incidents',
          new Date().toISOString().slice(0, 7)
        );
        const inc = tabs.find((i) => asStr(i['id']) === ownerId);
        if (inc) {
          spreadsheetId = resolved.spreadsheetId;
          branchId = candidate;
          resolvedShiftId = asStr(inc['shift_instance_id']) || null;
          tabMonth = asStr(inc['tab_month']) || tabMonth;
          found = true;
          break;
        }
      } catch {
        // lanjut
      }
    }
    if (!found) {
      return NextResponse.json({ error: 'Incident tidak ditemukan.' }, { status: 404 });
    }
    if (shiftInstanceId && resolvedShiftId && shiftInstanceId !== resolvedShiftId) {
      return NextResponse.json(
        { error: 'Foto tidak sesuai dengan shift incident.' },
        { status: 400 }
      );
    }

    await ensureMonthlySheet(spreadsheetId, 'Photos', tabMonth);
    const existing = await listMonthlyRows(spreadsheetId, 'Photos', tabMonth);
    const count = existing.filter(
      (p) => asStr(p['owner_type']) === 'incident' && asStr(p['owner_id']) === ownerId
    ).length;
    if (count >= MAX_INCIDENT_PHOTOS) {
      return NextResponse.json(
        { error: `Foto incident maksimal ${MAX_INCIDENT_PHOTOS}.` },
        { status: 400 }
      );
    }
  } else {
    if (!shiftInstanceId) {
      return NextResponse.json(
        { error: 'shiftInstanceId wajib untuk foto checklist/handover.' },
        { status: 400 }
      );
    }

    const resolved = await resolveInstance(ctx, shiftInstanceId);
    if (!resolved) {
      return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
    }
    spreadsheetId = resolved.spreadsheetId;
    branchId = resolved.branchId;
    tabMonth = resolved.tabMonth;
    resolvedShiftId = shiftInstanceId;

    if (asStr(resolved.instance['status']) !== 'berjalan') {
      return NextResponse.json(
        { error: 'Foto hanya dapat ditambahkan pada shift berjalan.' },
        { status: 409 }
      );
    }

    if (ownerType === 'entry') {
      let snapshot: { categories?: { points?: { point_ref: string }[] }[] } = {};
      try {
        snapshot = JSON.parse(asStr(resolved.instance['template_snapshot']));
      } catch {
        snapshot = {};
      }
      const pointExists = (snapshot.categories ?? []).some((c) =>
        (c.points ?? []).some((p) => p.point_ref === ownerId)
      );
      if (!pointExists) {
        return NextResponse.json(
          { error: 'Item foto tidak ditemukan pada shift ini.' },
          { status: 404 }
        );
      }
    }

    if (ownerType === 'handover') {
      const handovers = await listMonthlyRows(spreadsheetId, 'Handovers', tabMonth);
      const h = handovers.find((x) => asStr(x['id']) === ownerId);
      if (!h) {
        return NextResponse.json({ error: 'Handover tidak ditemukan.' }, { status: 404 });
      }
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const photoId = ulid();
  const { folderId } = await resolveCabang(branchId);
  const filename = `mycheck-${branchId}-${resolvedShiftId ?? 'general'}-${photoId}.${ext}`;

  const drive = getDriveClient();
  // Drive API mewajibkan media.body berupa stream — Buffer mentah membuat
  // googleapis gagal saat menyusun multipart ("part.body.pipe is not a
  // function"). Pola ini sama dengan uploadXlsxToDrive di stokis.
  const bodyStream = new PassThrough();
  bodyStream.end(buffer);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: file.type, body: bodyStream },
    fields: 'id, webViewLink',
  });
  const uploaded = {
    id: String(res.data.id),
    url: String(res.data.webViewLink ?? ''),
  };

  const photosTab = await ensureMonthlySheet(spreadsheetId, 'Photos', tabMonth);
  const photoRowId = ulid();
  await insertRow(spreadsheetId, photosTab, {
    id: photoRowId,
    shift_instance_id: resolvedShiftId,
    owner_type: ownerType,
    owner_id: ownerId,
    storage: 'drive',
    file_ref: uploaded.id,
    mime: file.type,
    size_bytes: buffer.length,
    sort_order: 0,
    status: 'uploaded',
    uploaded_by: ctx.user.id,
    uploaded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    status: 'uploaded',
    photo_id: photoRowId,
    file_ref: uploaded.id,
    url: uploaded.url,
  });
});