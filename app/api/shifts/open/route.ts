import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { buildTemplateSnapshot, type Snapshot } from '../../../../lib/db/snapshot';
import { appendAuditLogFor } from '../../../../lib/db/audit';
import { getServerTime } from '../../../../lib/db/server-time';
import { getShiftDate, isWithinShiftHours } from '../../../../lib/shift/time';
import { requireBranchAccess, withAuth } from '../../../../lib/api-auth';
import { filterRows, insertRow, asStr } from '../../../../lib/store';
import { resolveCabang } from '../../../../lib/google/registry';

interface OpenShiftBody {
  shiftDefinitionId?: string;
  isTest?: boolean;
}

function hashSnapshot(snapshot: Snapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

/**
 * Buka shift.
 * BR-01: satu shift non-void per (definisi shift + tanggal + is_test) per cabang.
 * BR-05: shift memakai snapshot template saat dibuka.
 * BR-02: tanggal shift = tanggal saat dibuka di zona waktu cabang.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  let body: OpenShiftBody;
  try {
    body = (await req.json()) as OpenShiftBody;
  } catch {
    body = {};
  }

  const shiftDefinitionId = body.shiftDefinitionId;
  if (!shiftDefinitionId) {
    return NextResponse.json({ error: 'shiftDefinitionId wajib diisi' }, { status: 400 });
  }
  const isTest = body.isTest === true;

  // Cari definisi di semua cabang yang bisa diakses user
  let definition: Record<string, unknown> | null = null;
  let spreadsheetId = '';
  let branchTimezone = 'Asia/Jakarta';
  let branchId = '';

  for (const cabangId of ctx.branchIds) {
    try {
      const { spreadsheetId: sid, cabang } = await resolveCabang(cabangId);
      const defs = await filterRows(sid, 'ShiftDefinitions', (r) => asStr(r['id']) === shiftDefinitionId);
      if (defs[0]) {
        definition = defs[0];
        spreadsheetId = sid;
        branchTimezone = (cabang['Timezone'] as string) || 'Asia/Jakarta';
        branchId = cabangId;
        break;
      }
    } catch {
      // lanjut ke cabang berikutnya
    }
  }

  if (!definition) {
    return NextResponse.json({ error: 'Definisi shift tidak ditemukan' }, { status: 404 });
  }
  if (String(definition['is_active']).toLowerCase() !== 'true' && definition['is_active'] !== true) {
    return NextResponse.json({ error: 'Definisi shift tidak aktif' }, { status: 400 });
  }

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  const now = getServerTime();
  const shiftDate = getShiftDate(now, branchTimezone);
  const snapshot = await buildTemplateSnapshot(spreadsheetId, shiftDefinitionId, branchTimezone);
  const snapshotHash = hashSnapshot(snapshot);
  const openedOutsideHours = !isWithinShiftHours(
    now,
    branchTimezone,
    asStr(definition['start_time']),
    asStr(definition['end_time'])
  );

  // Cek existing (BR-01)
  const existing = await filterRows(spreadsheetId, 'ShiftInstances', (r) =>
    asStr(r['shift_definition_id']) === shiftDefinitionId &&
    asStr(r['shift_date']) === shiftDate &&
    (asStr(r['is_test']).toLowerCase() === 'true' || r['is_test'] === true) === isTest &&
    asStr(r['status']) !== 'void'
  );
  if (existing[0]) {
    return NextResponse.json({
      status: 'bergabung',
      shift_instance_id: existing[0]['id'],
    });
  }

  const shiftInstanceId = ulid();
  await insertRow(spreadsheetId, 'ShiftInstances', {
    id: shiftInstanceId,
    shift_definition_id: shiftDefinitionId,
    shift_date: shiftDate,
    tab_month: shiftDate.slice(0, 7),
    status: 'berjalan',
    pj_user_id: ctx.user.id,
    opened_by: ctx.user.id,
    opened_at: now.toISOString(),
    opened_outside_hours: openedOutsideHours,
    is_test: isTest,
    snapshot_encoding: 'json',
    template_snapshot: JSON.stringify(snapshot),
    snapshot_hash: snapshotHash,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  await insertRow(spreadsheetId, 'Participants', {
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    user_id: ctx.user.id,
    first_action_at: now.toISOString(),
    first_action_type: 'buka_shift',
    created_at: now.toISOString(),
  });

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'open_shift',
    objectType: 'shift_instance',
    objectId: shiftInstanceId,
    branchId,
    shiftInstanceId,
    after: {
      shiftDefinitionId,
      shiftDate,
      isTest,
      openedOutsideHours,
      totalItems: snapshot.categories.reduce((sum, c) => sum + c.points.length, 0),
    },
  });

  return NextResponse.json({
    status: 'dibuka',
    shift_instance_id: shiftInstanceId,
    opened_outside_hours: openedOutsideHours,
    shift_date: shiftDate,
    total_items: snapshot.categories.reduce((sum, c) => sum + c.points.length, 0),
  });
});