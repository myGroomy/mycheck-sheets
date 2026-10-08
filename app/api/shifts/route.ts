import { NextRequest, NextResponse } from 'next/server';
import { getServerTime } from '../../../lib/db/server-time';
import { getShiftDate } from '../../../lib/shift/time';
import { withAuth } from '../../../lib/api-auth';
import { filterRows } from '../../../lib/store';
import { getCabangList } from '../../../lib/google/registry';

/**
 * Daftar shift untuk petugas: definisi shift aktif pada cabang yang
 * diakses + status instance hari ini (belum dibuka / berjalan / ditutup).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const branchIdParam = new URL(req.url).searchParams.get('branchId');
  const branchIds = branchIdParam
    ? ctx.branchIds.filter((id) => id === branchIdParam)
    : ctx.branchIds;

  if (branchIds.length === 0) {
    return NextResponse.json({ branches: [], shifts: [] });
  }

  const allCabangs = await getCabangList();
  const branchRows = allCabangs
    .filter((c) => branchIds.includes(c.Cabang_ID))
    .map((c) => ({
      id: c.Cabang_ID,
      name: (c['Nama_Cabang'] as string) || c.Cabang_ID,
      code: (c['Kode'] as string) || c.Cabang_ID,
      timezone: (c['Timezone'] as string) || 'Asia/Jakarta',
    }));

  const now = getServerTime();
  const shifts: {
    id: unknown;
    branchId: string;
    name: unknown;
    startTime: unknown;
    endTime: unknown;
    crossesMidnight: boolean;
    sortOrder: number;
    timezone: string;
    today: string;
    instance: {
      shift_instance_id: unknown;
      status: unknown;
      pj_user_id: unknown;
      opened_outside_hours: boolean;
    } | null;
  }[] = [];

  for (const branch of branchRows) {
    const cabang = allCabangs.find((c) => c.Cabang_ID === branch.id);
    if (!cabang?.Spreadsheet_ID) continue;

    const spreadsheetId = cabang.Spreadsheet_ID;
    const definitions = (await filterRows(spreadsheetId, 'ShiftDefinitions', (r) =>
      String(r['is_active']).toLowerCase() === 'true' || r['is_active'] === true
    )).sort((a, b) => Number(a['sort_order'] ?? 0) - Number(b['sort_order'] ?? 0));

    const today = getShiftDate(now, branch.timezone);
    const instances = await filterRows(spreadsheetId, 'ShiftInstances', (r) =>
      String(r['shift_date'] ?? '') === today &&
      String(r['status'] ?? '') !== 'void' &&
      (String(r['is_test']).toLowerCase() === 'true' || r['is_test'] === true ? 'true' : 'false') === 'false'
    );
    const instanceByDefinition = new Map<string, Record<string, unknown>>();
    for (const inst of instances) {
      instanceByDefinition.set(String(inst['shift_definition_id']), inst);
    }

    for (const def of definitions) {
      const instance = instanceByDefinition.get(String(def['id']));
      shifts.push({
        id: def['id'],
        branchId: cabang.Cabang_ID,
        name: def['name'],
        startTime: def['start_time'],
        endTime: def['end_time'],
        crossesMidnight: String(def['crosses_midnight']).toLowerCase() === 'true' || def['crosses_midnight'] === true,
        sortOrder: Number(def['sort_order'] ?? 0),
        timezone: branch.timezone,
        today,
        instance: instance
          ? {
              shift_instance_id: instance['id'],
              status: instance['status'],
              pj_user_id: instance['pj_user_id'],
              opened_outside_hours: String(instance['opened_outside_hours']).toLowerCase() === 'true' || instance['opened_outside_hours'] === true,
            }
          : null,
      });
    }
  }

  shifts.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const response = NextResponse.json({
    branches: branchRows,
    shifts,
    server_time: now.toISOString(),
  });
  response.headers.set('Cache-Control', 'private, max-age=30, must-revalidate');
  response.headers.set('Vary', 'Cookie');
  return response;
});