import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../lib/google/registry';
import { filterRows } from '../../../../lib/store';
import { asStr } from '../../../../lib/store';
import { listShiftDefinitions } from '../../../../lib/admin/template-service';
import { listShareTokens } from '../../../../lib/google/share-tokens';

/**
 * Daftar laporan untuk panel admin. Berbeda dari /api/reports, endpoint ini
 * tidak menyaring shift test dan mengembalikan `isLocked`.
 *
 * Query params:
 * - branchId: filter per cabang
 * - days: batasi ke N hari terakhir (default 7)
 */
export const GET = withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const params = new URL(_req.url).searchParams;
  const branchFilter = params.get('branchId');
  const daysParam = params.get('days');
  const dateFromParam = params.get('dateFrom');
  const dateToParam = params.get('dateTo');
  const pjNameFilter = params.get('pjName')?.trim().toLowerCase() ?? '';
  const days = daysParam ? Math.max(1, parseInt(daysParam, 10) || 7) : 7;
  const cutoffDate = new Date();
  cutoffDate.setUTCHours(0, 0, 0, 0);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (days - 1));
  const dateFrom = dateFromParam ? new Date(dateFromParam) : null;
  const dateTo = dateToParam ? new Date(dateToParam) : null;

  const cabangs = await getCabangList();
  const targets = cabangs.filter(
    (c) => ctx.branchIds.includes(c.Cabang_ID) && (!branchFilter || c.Cabang_ID === branchFilter)
  );

  // Ambil semua share tokens dari Registry sekali (bukan per cabang)
  let allTokens: { id: string; report_id: string; expires_at: string; expired: boolean }[] = [];
  try {
    const tokens = await listShareTokens();
    allTokens = tokens.map((t) => ({
      id: t.id,
      report_id: t.report_id,
      expires_at: t.expires_at,
      expired: Boolean(t.revoked_at),
    }));
  } catch {
    // Registry tidak tersedia — lanjut tanpa tokens
  }
  const tokensByReport = new Map<string, typeof allTokens>();
  for (const t of allTokens) {
    const list = tokensByReport.get(t.report_id) ?? [];
    list.push(t);
    tokensByReport.set(t.report_id, list);
  }

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
    tokens: { id: string; expires_at: string; expired: boolean }[];
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
      const shiftDate = inst ? asStr(inst['shift_date']) : null;
      if (shiftDate) {
        const reportDate = new Date(`${shiftDate}T00:00:00Z`);
        // An explicit date range (the UI's date filter) takes precedence over
        // the default rolling window; otherwise past-day searches are hidden.
        if (!dateFrom && !dateTo && reportDate < cutoffDate) continue;
        if (dateFrom && reportDate < dateFrom) continue;
        if (dateTo && reportDate > dateTo) continue;
      }
      const reportPjName = inst ? asStr(inst['pj_user_id']) : null;
      if (pjNameFilter && (!reportPjName || !reportPjName.toLowerCase().includes(pjNameFilter))) continue;
      const reportTokens = tokensByReport.get(asStr(report['id'])) ?? [];
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
        shiftDate,
        shiftStatus: inst ? asStr(inst['status']) : null,
        pjName: reportPjName,
        tokens: reportTokens,
      });
    }
  }

  results.sort((a, b) => {
    const d = String(b.shiftDate ?? '').localeCompare(String(a.shiftDate ?? ''));
    return d !== 0 ? d : String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? ''));
  });

  return NextResponse.json({ reports: results.slice(0, 50) });
});