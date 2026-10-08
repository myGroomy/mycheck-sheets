// app/api/incidents/route.ts
// Phase 4 (Sheets): daftar + buat incident.
import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { requireBranchAccess, withAuth } from '../../../lib/api-auth';
import { resolveCabang, getCabangList, getSettingsGlobal } from '../../../lib/google/registry';
import { appendAuditLogFor } from '../../../lib/db/audit';
import { getServerTime } from '../../../lib/db/server-time';
import { asBool, asStr, filterRows, insertRow, listMonthlyRows } from '../../../lib/store';
import { resolveInstance, tabMonthOf } from '../../../lib/instance-resolver';
import { candidateMonths, ensureIncidentTabs, incidentTabMonth, listActiveCategoriesAcrossBranches, pushNotification, upsertIncidentIndex, userNameMap, categoryNameMap } from '../../../lib/incidents';

interface IncidentBody {
  shiftInstanceId?: string;
  categoryId?: string;
  description?: string;
  occurredAt?: string;
  severity?: 'rendah' | 'sedang' | 'tinggi';
  outsideShift?: boolean;
}
const SEVERITIES = new Set(['rendah', 'sedang', 'tinggi']);
async function linkWindowHours(): Promise<number> {
  try {
    const s = await getSettingsGlobal();
    const raw = Number(s['incident_link_window_hours'] ?? 4);
    return Number.isFinite(raw) && raw > 0 ? raw : 4;
  } catch { return 4; }
}
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const cabangs = await getCabangList();
  const branchRows = cabangs.filter((c) => ctx.branchIds.includes(c.Cabang_ID)).map((c) => ({
    id: c.Cabang_ID, name: (c['Nama_Cabang'] as string) || c.Cabang_ID, code: (c['Kode'] as string) || c.Cabang_ID,
  }));
  const categories = await listActiveCategoriesAcrossBranches(ctx);
  const nameByUsername = await userNameMap();
  const categoryNames = await categoryNameMap(ctx);
  const incidents: Record<string, unknown>[] = [];
  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try { spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId; } catch { continue; }
    let indexed: Record<string, unknown>[] = [];
    try { indexed = await filterRows(spreadsheetId, 'IncidentIndex', () => true); } catch { indexed = []; }
    if (indexed.length > 0) {
      const byMonth = new Map<string, Record<string, unknown>[]>();
      for (const idx of indexed) {
        if (asBool(idx['is_test'])) continue;
        const m = asStr(idx['tab_month']);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(idx);
      }
      for (const [month, list] of byMonth) {
        const rows = await listMonthlyRows(spreadsheetId, 'Incidents', month);
        const byId = new Map(rows.map((r) => [asStr(r['id']), r]));
        for (const idx of list) {
          const row = byId.get(asStr(idx['incident_id']));
          if (!row || asBool(row['is_test'])) continue;
          incidents.push({
            id: asStr(row['id']), branchId: cabang.Cabang_ID,
            branchName: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
            shiftInstanceId: asStr(row['shift_instance_id']) || null,
            categoryId: asStr(row['category_id']),
            categoryName: categoryNames.get(asStr(row['category_id'])) ?? '',
            description: asStr(row['description']), occurredAt: asStr(row['occurred_at']),
            reportedAt: asStr(row['reported_at']),
            reportedByName: nameByUsername.get(asStr(row['reported_by'])) ?? asStr(row['reported_by']),
            status: asStr(row['status']), severity: asStr(row['severity']) || null,
            outsideShift: asBool(row['outside_shift']),
          });
        }
      }
    } else {
      for (const month of candidateMonths()) {
        const rows = await listMonthlyRows(spreadsheetId, 'Incidents', month);
        for (const row of rows) {
          if (asBool(row['is_test'])) continue;
          incidents.push({
            id: asStr(row['id']), branchId: cabang.Cabang_ID,
            branchName: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
            shiftInstanceId: asStr(row['shift_instance_id']) || null,
            categoryId: asStr(row['category_id']),
            categoryName: categoryNames.get(asStr(row['category_id'])) ?? '',
            description: asStr(row['description']), occurredAt: asStr(row['occurred_at']),
            reportedAt: asStr(row['reported_at']),
            reportedByName: nameByUsername.get(asStr(row['reported_by'])) ?? asStr(row['reported_by']),
            status: asStr(row['status']), severity: asStr(row['severity']) || null,
            outsideShift: asBool(row['outside_shift']),
          });
        }
      }
    }
  }
  incidents.sort((a, b) => String(b['reportedAt'] ?? '').localeCompare(String(a['reportedAt'] ?? '')));
  const response = NextResponse.json({
    categories: categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
    branches: branchRows, incidents: incidents.slice(0, 100),
  });
  response.headers.set('Cache-Control', 'private, max-age=60, must-revalidate');
  response.headers.set('Vary', 'Cookie');
  return response;
});
export const POST = withAuth(async (req: NextRequest, ctx) => {
  let body: IncidentBody = {};
  try { body = (await req.json()) as IncidentBody; } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }
  const categoryId = body.categoryId;
  const description = body.description?.trim();
  if (!categoryId || !description) {
    return NextResponse.json({ error: 'categoryId dan description wajib diisi' }, { status: 400 });
  }
  if (description.length > 3000) return NextResponse.json({ error: 'Deskripsi maksimal 3000 karakter.' }, { status: 400 });
  if (body.severity && !SEVERITIES.has(body.severity)) return NextResponse.json({ error: 'severity tidak valid.' }, { status: 400 });
  const now = getServerTime();
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : now;
  if (Number.isNaN(occurredAt.getTime())) return NextResponse.json({ error: 'occurredAt tidak valid.' }, { status: 400 });
  const categories = await listActiveCategoriesAcrossBranches(ctx);
  if (!categories.some((c) => c.id === categoryId)) return NextResponse.json({ error: 'Kategori incident tidak valid' }, { status: 404 });
  let branchId: string | null = null;
  let spreadsheetId = '';
  let tabMonth = occurredAt.toISOString().slice(0, 7);
  const shiftInstanceId: string | null = body.shiftInstanceId ?? null;
  if (shiftInstanceId) {
    const resolved = await resolveInstance(ctx, shiftInstanceId);
    if (!resolved) return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
    const branchAccessError = requireBranchAccess(ctx, resolved.branchId);
    if (branchAccessError) return branchAccessError;
    const status = asStr(resolved.instance['status']);
    const windowHours = await linkWindowHours();
    const closedAtRaw = asStr(resolved.instance['closed_at']);
    const isActiveShift = status === 'berjalan';
    const isRecentClosedShift = (status === 'ditutup' || status === 'ditutup_paksa') && closedAtRaw
      ? now.getTime() - new Date(closedAtRaw).getTime() <= windowHours * 60 * 60 * 1000 : false;
    if (!isActiveShift && !isRecentClosedShift) {
      return NextResponse.json({ error: `Incident hanya dapat dibuat untuk shift berjalan atau ditutup maksimal ${windowHours} jam lalu.` }, { status: 400 });
    }
    branchId = resolved.branchId;
    spreadsheetId = resolved.spreadsheetId;
    tabMonth = tabMonthOf(resolved.instance);
  } else {
    branchId = ctx.branchIds[0] ?? null;
  }
  if (!branchId) return NextResponse.json({ error: 'Cabang incident tidak ditentukan' }, { status: 400 });
  try {
    const { spreadsheetId: sid } = await resolveCabang(branchId);
    spreadsheetId = spreadsheetId || sid;
  } catch { return NextResponse.json({ error: 'Cabang incident tidak ditemukan' }, { status: 404 }); }
  const incidentId = ulid();
  const reportedAt = now.toISOString();
  const outsideShift = shiftInstanceId ? false : Boolean(body.outsideShift ?? true);
  try {
    tabMonth = incidentTabMonth({ tab_month: tabMonth, occurred_at: occurredAt.toISOString() });
    await ensureIncidentTabs(spreadsheetId, tabMonth);
    const { monthlySheet } = await import('../../../lib/google/branch-schema');
    await insertRow(spreadsheetId, monthlySheet('Incidents', tabMonth), {
      id: incidentId, shift_instance_id: shiftInstanceId ?? '', tab_month: tabMonth,
      category_id: categoryId, description, occurred_at: occurredAt.toISOString(),
      reported_by: ctx.user.id, reported_at: reportedAt, status: 'open',
      outside_shift: outsideShift, link_source: shiftInstanceId ? 'otomatis' : 'none',
      linked_by: '', linked_at: '', source_entry_id: '', severity: body.severity ?? '',
      status_changed_by: '', status_changed_at: '', is_test: false,
      created_at: reportedAt, updated_at: reportedAt, version: 1,
    });
    await upsertIncidentIndex(spreadsheetId, {
      incident_id: incidentId, tab_month: tabMonth, status: 'open', category_id: categoryId,
      shift_instance_id: shiftInstanceId ?? '', outside_shift: outsideShift, reported_at: reportedAt, is_test: false,
    });
    await appendAuditLogFor(spreadsheetId, {
      actorId: ctx.user.id, action: 'create_incident', objectType: 'incident', objectId: incidentId,
      branchId, shiftInstanceId: shiftInstanceId ?? undefined,
      after: { categoryId, description, occurredAt: occurredAt.toISOString(), severity: body.severity ?? null },
    });
    try {
      await pushNotification(spreadsheetId, {
        userId: ctx.user.id, type: 'incident_created', title: 'Incident terkirim',
        body: description.slice(0, 140), link: `/incident/${incidentId}`,
      });
    } catch { /* best-effort */ }
    return NextResponse.json({ status: 'dibuat', incident_id: incidentId });
  } catch (error) {
    console.error('Create incident error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan pada server saat membuat incident' }, { status: 500 });
  }
});
