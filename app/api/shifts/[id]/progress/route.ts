import { NextResponse } from 'next/server';
import type { Snapshot } from '../../../../../lib/db/snapshot';
import { getServerTime } from '../../../../../lib/db/server-time';
import { getZonedParts, isPointActiveOn } from '../../../../../lib/shift/time';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { filterRows, listMonthlyRows } from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';
import { readSheetData, sheetToObjects } from '../../../../../lib/google/sheets';

interface ProgressEntry {
  point_ref: string;
  title: string;
  instruction: string | null;
  input_type: string;
  is_required: boolean;
  target_time: string | null;
  number_min: number | null;
  number_max: number | null;
  sort_order: number;
  state: 'belum' | 'selesai' | 'skip';
  value: string | null;
  out_of_range: boolean;
  skip_reason: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  timing_label: string | null;
  timing_delta_minutes: number | null;
}

interface ProgressCategory {
  id: string;
  name: string;
  sort_order: number;
  points: ProgressEntry[];
}

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const pathParts = new URL(_req.url).pathname.split('/');
  const shiftInstanceId = pathParts[pathParts.length - 2];

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, spreadsheetId, branchId, branchTimezone, tabMonth } = resolved;

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(String(instance['template_snapshot'] ?? '{}')) as Snapshot;
  } catch {
    return NextResponse.json({ error: 'Snapshot template tidak valid' }, { status: 500 });
  }

  const now = getServerTime();
  const dayKey = getZonedParts(now, branchTimezone).dayKey;

  const entryRows = (await listMonthlyRows(spreadsheetId, 'Entries', tabMonth)).filter(
    (r) => String(r['shift_instance_id']) === shiftInstanceId
  );
  const entryByRef = new Map<string, Record<string, unknown>>(
    entryRows.map((e) => [String(e['point_ref']), e])
  );

  // Nama user dari Users sheet (Registry)
  const nameById = new Map<string, string>();
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (registryId) {
    const { headers, rows } = await readSheetData(registryId, 'Users');
    const users = sheetToObjects(headers, rows) as Record<string, string>[];
    for (const u of users) {
      nameById.set(String(u['Username'] ?? ''), String(u['Nama'] ?? ''));
    }
  }

  const categories: ProgressCategory[] = (snapshot.categories ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    sort_order: cat.sort_order,
    points: cat.points
      .filter((p) => isPointActiveOn(p.active_days, dayKey))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map<ProgressEntry>((p) => {
        const entry = entryByRef.get(p.point_ref);
        return {
          point_ref: p.point_ref,
          title: p.title,
          instruction: p.instruction,
          input_type: p.input_type,
          is_required: p.is_required,
          target_time: p.target_time,
          number_min: p.number_min,
          number_max: p.number_max,
          sort_order: p.sort_order,
          state: (entry?.['state'] as 'belum' | 'selesai' | 'skip') ?? 'belum',
          value: (entry?.['value'] as string) ?? null,
          out_of_range: String(entry?.['out_of_range'] ?? '').toLowerCase() === 'true',
          skip_reason: (entry?.['skip_reason'] as string) ?? null,
          completed_by: (entry?.['completed_by'] as string) ?? null,
          completed_by_name: entry?.['completed_by']
            ? (nameById.get(String(entry['completed_by'])) ?? null)
            : null,
          completed_at: (entry?.['completed_at'] as string) ?? null,
          timing_label: (entry?.['timing_label'] as string) ?? null,
          timing_delta_minutes: entry?.['timing_delta_minutes']
            ? Number(entry['timing_delta_minutes'])
            : null,
        };
      }),
  }));

  const allPoints = categories.flatMap((c) => c.points);
  const done = allPoints.filter((p) => p.state === 'selesai').length;
  const skipped = allPoints.filter((p) => p.state === 'skip').length;

  const participantRows = (
    await filterRows(spreadsheetId, 'Participants', (r) =>
      String(r['shift_instance_id']) === shiftInstanceId
    )
  ).sort((a, b) => String(a['first_action_at'] ?? '').localeCompare(String(b['first_action_at'] ?? '')));

  const perUser = new Map<string, number>();
  for (const row of entryRows) {
    if (!row['completed_by']) continue;
    const key = String(row['completed_by']);
    perUser.set(key, (perUser.get(key) ?? 0) + 1);
  }

  return NextResponse.json(
    {
      shift: {
        id: instance['id'],
        branch_id: branchId,
        branch_timezone: branchTimezone,
        shift_definition_id: instance['shift_definition_id'],
        name: snapshot.shift?.name ?? '',
        start_time: snapshot.shift?.start_time ?? '',
        end_time: snapshot.shift?.end_time ?? '',
        date: instance['shift_date'],
        status: instance['status'],
        pj_user_id: instance['pj_user_id'],
        opened_outside_hours: String(instance['opened_outside_hours']).toLowerCase() === 'true',
        is_test: String(instance['is_test']).toLowerCase() === 'true',
      },
      progress: {
        total: allPoints.length,
        selesai: done,
        skip: skipped,
        belum: allPoints.length - done - skipped,
        wajib_selesai: allPoints.filter((p) => p.is_required && p.state === 'selesai').length,
      },
      categories,
      participants: participantRows.map((p) => ({
        user_id: p['user_id'],
        name: nameById.get(String(p['user_id'])) ?? String(p['user_id']),
        is_pj: String(p['user_id']) === String(instance['pj_user_id']),
        first_action_type: p['first_action_type'],
        first_action_at: p['first_action_at'],
        items_done: perUser.get(String(p['user_id'])) ?? 0,
      })),
      handover_fields: snapshot.handover_fields ?? [],
      server_time: now.toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
      },
    }
  );
});