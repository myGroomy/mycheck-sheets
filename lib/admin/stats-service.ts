// lib/admin/stats-service.ts
// Statistik dasbor admin lintas cabang. Satu sumber untuk API route
// (`/api/admin/stats`) dan halaman `app/admin/page.tsx`.

import { getCabangList } from '../google/registry';
import { filterRowsMulti } from '../store';
import { asStr } from '../store';
import { listShiftDefinitions } from './template-service';
import type { AuthContext } from '../api-auth';

export interface AdminStats {
  stats: {
    branches: number;
    activeShifts: number;
    openIncidents: number;
    reportsToday: number;
  };
  branches: {
    id: string;
    name: string;
    code: string;
    activeShifts: number;
    openIncidents: number;
    reportsToday: number;
  }[];
  alerts: {
    branchId: string;
    branchName: string;
    shiftName: string;
    openedAt: string | null;
    pjName: string | null;
  }[];
}

export async function buildAdminStats(ctx: AuthContext): Promise<AdminStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const cabangs = await getCabangList();
  const targets = cabangs.filter((c) => ctx.branchIds.includes(c.Cabang_ID));

  let activeShiftsTotal = 0;
  let openIncidentsTotal = 0;
  let reportsTodayTotal = 0;

  const branchStats: AdminStats['branches'] = [];
  const alerts: AdminStats['alerts'] = [];

  for (const cabang of targets) {
    let activeShifts = 0;
    let openIncidents = 0;
    let reportsToday = 0;

    if (cabang.Spreadsheet_ID) {
      const spreadsheetId = String(cabang.Spreadsheet_ID);

      // Tiga sheet statis dibaca dalam satu panggilan API (values.batchGet).
      const [instances, index, reports] = await filterRowsMulti(spreadsheetId, [
        { sheet: 'ShiftInstances' },
        { sheet: 'IncidentIndex' },
        { sheet: 'Reports' },
      ]);

      const openInstances = instances.filter((i) => asStr(i['status']) === 'berjalan');
      activeShifts = openInstances.length;

      // IncidentIndex adalah indeks ringan (satu baris per incident)
      openIncidents = index.filter((i) => asStr(i['status']) === 'open').length;

      reportsToday = reports.filter((r) => asStr(r['generated_at']) >= todayIso).length;

      // Alert: shift berjalan tanpa report
      const reportedIds = new Set(reports.map((r) => asStr(r['shift_instance_id'])));
      const definitionNames = new Map<string, string>();
      try {
        const defs = await listShiftDefinitions(spreadsheetId);
        defs.forEach((d) => definitionNames.set(d.id, d.name));
      } catch {
        // abaikan
      }

      for (const inst of openInstances) {
        if (reportedIds.has(asStr(inst['id']))) continue;
        alerts.push({
          branchId: cabang.Cabang_ID,
          branchName: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
          shiftName: definitionNames.get(asStr(inst['shift_definition_id'])) ?? '',
          openedAt: asStr(inst['opened_at']) || null,
          pjName: asStr(inst['pj_user_id']) || null,
        });
      }
    }

    activeShiftsTotal += activeShifts;
    openIncidentsTotal += openIncidents;
    reportsTodayTotal += reportsToday;

    branchStats.push({
      id: cabang.Cabang_ID,
      name: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
      code: (cabang['Kode'] as string) || cabang.Cabang_ID,
      activeShifts,
      openIncidents,
      reportsToday,
    });
  }

  alerts.sort((a, b) =>
    String(b.openedAt ?? '').localeCompare(String(a.openedAt ?? ''))
  );

  return {
    stats: {
      branches: targets.length,
      activeShifts: activeShiftsTotal,
      openIncidents: openIncidentsTotal,
      reportsToday: reportsTodayTotal,
    },
    branches: branchStats.sort((a, b) => a.name.localeCompare(b.name)),
    alerts: alerts.slice(0, 8),
  };
}