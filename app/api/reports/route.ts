import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../lib/google/registry';
import { filterRows } from '../../../lib/store';
import { asStr } from '../../../lib/store';
import { listShiftDefinitions } from '../../../lib/admin/template-service';

/** Daftar laporan (Reports) dari seluruh cabang yang diakses user. */
export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  if (ctx.branchIds.length === 0) return NextResponse.json({ reports: [] });

  const cabangs = await getCabangList();
  const results: {
    id: string;
    reportNumber: string;
    generatedAt: string | null;
    branchId: string;
    branchName: string;
    branchCode: string;
    shiftName: string;
    shiftDate: string | null;
    shiftStatus: string | null;
    pjName: string | null;
  }[] = [];

  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID)) continue;
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
      if (inst) {
        const status = asStr(inst['status']);
        const isTest = asStr(inst['is_test']) === 'TRUE' || asStr(inst['is_test']) === 'true';
        if (status === 'void' || isTest) continue;
      }

      results.push({
        id: asStr(report['id']),
        reportNumber: asStr(report['report_number']),
        generatedAt: asStr(report['generated_at']) || null,
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
    const dateCmp = String(b.shiftDate ?? '').localeCompare(String(a.shiftDate ?? ''));
    return dateCmp !== 0 ? dateCmp : String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? ''));
  });

  const response = NextResponse.json({ reports: results.slice(0, 100) });
  response.headers.set('Cache-Control', 'private, max-age=60, must-revalidate');
  response.headers.set('Vary', 'Cookie');
  return response;
});