import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { getServerTime } from '../../../../../lib/db/server-time';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import {
  ensureMonthlySheet,
  filterRows,
  findRow,
  insertRow,
  listMonthlyRows,
  updateRow,
} from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';
import { readSheetData, sheetToObjects } from '../../../../../lib/google/sheets';

interface CloseBody {
  pin?: string;
  values?: Record<string, unknown>;
  free_text?: string;
  no_incident?: boolean;
}

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const pathParts = new URL(_req.url).pathname.split('/');
  const shiftInstanceId = pathParts[pathParts.length - 2];

  let body: CloseBody = {};
  try {
    body = (await _req.json()) as CloseBody;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, rowNumber, spreadsheetId, branchId, tabMonth } = resolved;

  if (String(instance['pj_user_id']) !== ctx.user.id) {
    return NextResponse.json({ error: 'Hanya PJ yang dapat menutup shift' }, { status: 403 });
  }

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  if (String(instance['status']) !== 'berjalan') {
    return NextResponse.json({ error: 'Shift tidak sedang berjalan' }, { status: 409 });
  }

  // Verifikasi PIN plaintext dari sheet Users (Registry)
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (registryId) {
    const { headers, rows } = await readSheetData(registryId, 'Users');
    const users = sheetToObjects(headers, rows) as Record<string, string>[];
    const user = users.find(
      (u) => String(u['Username'] ?? '').toLowerCase() === ctx.user.id.toLowerCase()
    );
    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    if (!body.pin || String(user['PIN'] ?? '') !== body.pin) {
      return NextResponse.json(
        { error: 'PIN salah. Tutup shift dibatalkan.' },
        { status: 400 }
      );
    }
  }

  // Build snapshot from template
  let snapshot: {
    categories?: Array<{ points?: Array<{ point_ref: string; is_required?: boolean }> }>;
    handover_fields?: Array<{
      id: string;
      field_type: string;
      input_types?: string[];
      options?: string[] | null;
      is_required?: boolean;
    }>;
  };
  try {
    snapshot = JSON.parse(String(instance['template_snapshot'] ?? '{}'));
  } catch {
    snapshot = {};
  }

  const requiredPoints = (snapshot.categories ?? []).flatMap((category) => category.points ?? []);
  const requiredIds = requiredPoints.filter((point) => point.is_required).map((point) => point.point_ref);

  const entryRows = requiredIds.length
    ? await listMonthlyRows(spreadsheetId, 'Entries', tabMonth).then((rows) =>
        rows.filter(
          (r) =>
            String(r['shift_instance_id']) === shiftInstanceId &&
            requiredIds.includes(String(r['point_ref']))
        )
      )
    : [];

  const invalid = requiredIds.filter((pointRef) => {
    const row = entryRows.find((entry) => String(entry['point_ref']) === pointRef);
    return !row || !['selesai', 'skip'].includes(String(row['state']));
  });

  if (invalid.length > 0) {
    return NextResponse.json(
      { error: 'Ada item wajib yang belum selesai/skip.', invalid_points: invalid },
      { status: 400 }
    );
  }

  const handoverTab = await ensureMonthlySheet(spreadsheetId, 'Handovers', tabMonth);
  const existingHandover = (await listMonthlyRows(spreadsheetId, 'Handovers', tabMonth)).find(
    (r) => String(r['shift_instance_id']) === shiftInstanceId
  ) ?? null;
  const allHandoverFields = snapshot.handover_fields ?? [];
  const handoverValues = body.values ?? {};
  const configuredFieldIds = new Set(allHandoverFields.map((field) => field.id));
  if (Object.keys(handoverValues).some((id) => !configuredFieldIds.has(id))) {
    return NextResponse.json({ error: 'Field handover tidak sesuai dengan konfigurasi shift.' }, { status: 400 });
  }
  const missingHandover: string[] = [];
  const invalidHandover: string[] = [];
  const handoverPhotoIds: string[] = [];
  for (const field of allHandoverFields) {
    const types = field.input_types?.length ? field.input_types : [field.field_type];
    const raw = handoverValues[field.id];
    const values = types.length > 1 && raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : types.length === 1 ? { [types[0]]: raw } : {};
    const complete: Record<string, unknown> = {};
    for (const type of types) {
      const value = values[type];
      const empty = value === undefined || value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        if (field.is_required) missingHandover.push(field.id);
        continue;
      }
      let valid = true;
      if (type === 'foto') {
        valid = Array.isArray(value) && value.length <= 5 && value.every((id) => typeof id === 'string');
        if (valid) handoverPhotoIds.push(...value as string[]);
      } else if (type === 'angka') {
        valid = Number.isFinite(Number(value));
      } else if (['pilihan', 'pilihan_ganda', 'dropdown'].includes(type)) {
        valid = typeof value === 'string' && (field.options ?? []).includes(value);
      } else if (type === 'kotak_centang') {
        valid = Array.isArray(value) && value.length > 0 &&
          value.every((item) => typeof item === 'string' && (field.options ?? []).includes(item)) &&
          new Set(value).size === value.length;
      } else if (type === 'ya_tidak') {
        valid = value === 'Ya' || value === 'Tidak' || value === 'ya' || value === 'tidak';
      } else if (type === 'tanggal_waktu') {
        valid = typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
      } else {
        valid = typeof value === 'string' && value.trim().length <= 2000;
      }
      if (!valid) invalidHandover.push(field.id);
      complete[type] = value;
    }
    if (types.length > 1) handoverValues[field.id] = complete;
  }

  if (missingHandover.length > 0 || invalidHandover.length > 0) {
    return NextResponse.json(
      {
        error: missingHandover.length ? 'Semua komponen handover wajib diisi.' : 'Nilai handover tidak sesuai dengan tipe input.',
        missing: [...new Set(missingHandover)],
        invalid: [...new Set(invalidHandover)],
      },
      { status: 400 }
    );
  }
  if (handoverPhotoIds.length) {
    if (!existingHandover) {
      return NextResponse.json({ error: 'Foto handover belum terhubung dengan handover shift ini.' }, { status: 400 });
    }
    const storedPhotos = await listMonthlyRows(spreadsheetId, 'Photos', tabMonth);
    const allowed = new Set(storedPhotos.filter((photo) =>
      String(photo['owner_type']) === 'handover' &&
      String(photo['owner_id']) === String(existingHandover['id']) &&
      String(photo['shift_instance_id']) === shiftInstanceId &&
      String(photo['status']) === 'uploaded'
    ).map((photo) => String(photo['id'])));
    if (handoverPhotoIds.some((id) => !allowed.has(id)) || new Set(handoverPhotoIds).size !== handoverPhotoIds.length) {
      return NextResponse.json({ error: 'Foto handover tidak valid.' }, { status: 400 });
    }
  }

  const now = getServerTime();

  // Upsert handover (tab bulanan Handovers_<YYYY-MM>)
  const handoverValuesJson = JSON.stringify(handoverValues);
  if (existingHandover) {
    const handoverRow = await findRow(spreadsheetId, handoverTab, 'shift_instance_id', shiftInstanceId);
    if (handoverRow) {
      await updateRow(spreadsheetId, handoverTab, handoverRow.rowNumber, {
        values: handoverValuesJson,
        free_text: body.free_text ?? '',
        submitted_by: ctx.user.id,
        submitted_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }
  } else {
    await insertRow(spreadsheetId, handoverTab, {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      values: handoverValuesJson,
      free_text: body.free_text ?? '',
      photo_ids: '',
      submitted_by: ctx.user.id,
      submitted_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        shiftInstanceId,
        shiftDate: instance['shift_date'],
        submittedBy: ctx.user.id,
        handoverValues,
        requiredPoints: requiredIds,
        createdAt: now.toISOString(),
      })
    )
    .digest('hex');

  const reportNumber = `R-${String(instance['shift_date']).replace(/-/g, '')}-${shiftInstanceId.slice(-4)}`;
  const existingReport = await filterRows(spreadsheetId, 'Reports', (r) => String(r['shift_instance_id']) === shiftInstanceId);
  if (!existingReport[0]) {
    await insertRow(spreadsheetId, 'Reports', {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      report_number: reportNumber,
      generated_by: ctx.user.id,
      generated_at: now.toISOString(),
      is_locked: true,
      summary_stats: JSON.stringify({
        total_required: requiredIds.length,
        done: entryRows.filter((row) => String(row['state']) === 'selesai').length,
        skipped: entryRows.filter((row) => String(row['state']) === 'skip').length,
      }),
      content_hash: contentHash,
      unlock_count: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  // Update Shift_Instances: tutup shift
  await updateRow(spreadsheetId, 'ShiftInstances', rowNumber, {
    status: 'ditutup',
    closed_at: now.toISOString(),
    closed_by: ctx.user.id,
    close_type: 'normal',
    no_incident_confirmed: body.no_incident ?? false,
    updated_at: now.toISOString(),
  });

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'close_shift',
    objectType: 'shift_instance',
    objectId: shiftInstanceId,
    branchId,
    shiftInstanceId,
    after: {
      status: 'ditutup',
      closedBy: ctx.user.id,
      reportNumber,
      handoverValues,
    },
  });

  return NextResponse.json({ status: 'ditutup', report_number: reportNumber });
});