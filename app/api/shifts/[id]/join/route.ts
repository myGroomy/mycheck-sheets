import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { getServerTime } from '../../../../../lib/db/server-time';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { filterRows, insertRow } from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';

/**
 * Gabung shift yang sedang berjalan.
 * `?duty=1` menandai aksi pertama pengguna sebagai "saya bertugas".
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const pathParts = new URL(req.url).pathname.split('/');
  const shiftInstanceId = pathParts[pathParts.length - 2];
  const isDuty = new URL(req.url).searchParams.get('duty') === '1';

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, spreadsheetId, branchId } = resolved;

  if (String(instance['status']) !== 'berjalan') {
    return NextResponse.json(
      { error: 'Shift sudah ditutup. Tidak bisa bergabung.' },
      { status: 409 }
    );
  }

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  const now = getServerTime();

  const existing = await filterRows(spreadsheetId, 'Participants', (r) =>
    String(r['shift_instance_id']) === shiftInstanceId && String(r['user_id']) === ctx.user.id
  );

  let joined = false;
  let firstActionType: string;
  if (existing[0]) {
    firstActionType = String(existing[0]['first_action_type'] ?? '');
  } else {
    firstActionType = isDuty ? 'saya_bertugas' : 'buka_shift';
    await insertRow(spreadsheetId, 'Participants', {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      user_id: ctx.user.id,
      first_action_at: now.toISOString(),
      first_action_type: firstActionType,
      created_at: now.toISOString(),
    });
    joined = true;

    await appendAuditLogFor(spreadsheetId, {
      actorId: ctx.user.id,
      action: isDuty ? 'declare_duty' : 'join_shift',
      objectType: 'shift_instance',
      objectId: shiftInstanceId,
      branchId,
      shiftInstanceId,
      after: { userId: ctx.user.id, firstActionType },
    });
  }

  const participantCount = (await filterRows(spreadsheetId, 'Participants', (r) =>
    String(r['shift_instance_id']) === shiftInstanceId
  )).length;

  return NextResponse.json({
    status: 'bergabung',
    shift_instance_id: shiftInstanceId,
    already_joined: !joined,
    first_action_type: firstActionType,
    participant_count: participantCount,
  });
});