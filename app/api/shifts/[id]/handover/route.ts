import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import {
  ensureMonthlySheet,
  findRow,
  insertRow,
  listMonthlyRows,
  updateRow,
} from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';

interface HandoverBody {
  values?: Record<string, unknown>;
  free_text?: string;
  no_incident?: boolean;
  noIncidentConfirmed?: boolean;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const pathParts = new URL(req.url).pathname.split('/');
  const shiftInstanceId = pathParts[pathParts.length - 2];

  let body: HandoverBody = {};
  try {
    body = (await req.json()) as HandoverBody;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, rowNumber, spreadsheetId, branchId, tabMonth } = resolved;

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  let snapshot: { handover_fields?: Array<{ id: string; label: string; is_required?: boolean }> };
  try {
    snapshot = JSON.parse(String(instance['template_snapshot'] ?? '{}'));
  } catch {
    snapshot = {};
  }
  const requiredFields = (snapshot.handover_fields ?? []).filter((field) => field.is_required);

  const values = body.values ?? {};
  const missingRequired = requiredFields.filter((field) => {
    const val = values[field.id];
    return val === undefined || val === null || String(val).trim() === '';
  });

  if (missingRequired.length > 0) {
    return NextResponse.json(
      { error: 'Field handover wajib belum diisi.', missing: missingRequired.map((field) => field.id) },
      { status: 400 }
    );
  }

  const now = new Date();

  const handoversTab = await ensureMonthlySheet(spreadsheetId, 'Handovers', tabMonth);
  const existing = (await listMonthlyRows(spreadsheetId, 'Handovers', tabMonth)).find(
    (r) => String(r['shift_instance_id']) === shiftInstanceId
  ) ?? null;
  const handoverId = existing ? String(existing['id']) : ulid();
  const valuesJson = JSON.stringify(values);

  if (existing) {
    const found = await findRow(spreadsheetId, handoversTab, 'id', handoverId);
    if (found) {
      await updateRow(spreadsheetId, handoversTab, found.rowNumber, {
        values: valuesJson,
        free_text: body.free_text ?? '',
        submitted_by: ctx.user.id,
        submitted_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }
  } else {
    await insertRow(spreadsheetId, handoversTab, {
      id: handoverId,
      shift_instance_id: shiftInstanceId,
      values: valuesJson,
      free_text: body.free_text ?? '',
      photo_ids: '',
      submitted_by: ctx.user.id,
      submitted_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  await updateRow(spreadsheetId, 'ShiftInstances', rowNumber, {
    no_incident_confirmed: Boolean(body.no_incident ?? body.noIncidentConfirmed),
    updated_at: now.toISOString(),
  });

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'submit_handover',
    objectType: 'handover',
    objectId: handoverId,
    branchId,
    shiftInstanceId,
    before: existing ? { id: existing['id'] } : null,
    after: {
      submittedBy: ctx.user.id,
      noIncidentConfirmed: Boolean(body.no_incident ?? body.noIncidentConfirmed),
      values,
    },
  });

  return NextResponse.json({
    status: 'ok',
    handover_id: handoverId,
    action: existing ? 'diperbarui' : 'dibuat',
  });
});