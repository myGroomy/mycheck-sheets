import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../lib/google/registry';
import { filterRows } from '../../../../lib/store';
import { asStr } from '../../../../lib/store';
import { listShiftDefinitions } from '../../../../lib/admin/template-service';

/**
 * Daftar laporan untuk panel admin. Berbeda dari /api/reports, endpoint ini
 * tidak menyaring shift test dan mengembalikan `isLocked`.
 */
export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const branchFilter = new URL(_req.url).searchParams.get('branchId');
  const cabangs = await getCabangList();
  const targets = cabangs.filter(
    (c) => ctx.branchIds.includes(c.Cabang_ID) && (!branchFilter || c.Cabang_ID === branchFilter)
  );

  const results: {
    id: string;
    reportNumber: string;
    generatedAt: string | null;
    isLocked: boolean;
    archivePdfDriveUrl: null;
    branchId: string;
    branchName: string;
    branchCode: string;
    shiftName: string;
    shiftDate: string | null;
    shiftStatus: string | null;
    pjName: string | null;
  }[] = [];

  for (const cabang of targets) {
    if (!cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }

    const definitionNames = new Map<string, string>();
    try {
      const defs = await listShiftDefinitions(spreadsheetId);
      defs.forEach((d) => definitionNames.set(d.id, d.name));
    } catch {
      // abaikan
    }

    const reports = await filterRows(spreadsheetId, 'Reports', () => true);
    const instances = await filterRows(spreadsheetId, 'ShiftInstances', () => true);
    const byId = new Map(instances.map((i) => [asStr(i['id']), i]));

    for (const report of reports) {
      const inst = byId.get(asStr(report['shift_instance_id']));
      results.push({
        id: asStr(report['id']),
        reportNumber: asStr(report['report_number']),
        generatedAt: asStr(report['generated_at']) || null,
        isLocked: asStr(report['is_locked']) === 'TRUE',
        // Kolom arsip PDF belum ada di template cabang
        archivePdfDriveUrl: null,
        branchId: cabang.Cabang_ID,
        branchName: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
        branchCode: (cabang['Kode'] as string) || cabang.Cabang_ID,
        shiftName: definitionNames.get(asStr(inst?.['shift_definition_id'] ?? '')) ?? '',
        shiftDate: inst ? asStr(inst['shift_date']) : null,
        shiftStatus: inst ? asStr(inst['status']) : null,
        pjName: inst ? asStr(inst['pj_user_id']) : null,
      });
    }
  }

  results.sort((a, b) => {
    const d = String(b.shiftDate ?? '').localeCompare(String(a.shiftDate ?? ''));
    return d !== 0 ? d : String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? ''));
  });

  return NextResponse.json({ reports: results.slice(0, 200) });
});