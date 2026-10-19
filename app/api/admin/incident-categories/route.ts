// app/api/admin/incident-categories/route.ts Phase 4 (Sheets).
// GET: gabungan kategori semua cabang (beserta branchId). POST: buat di cabang target.
import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { resolveCabang, getCabangList } from '../../../../lib/google/registry';
import { appendAuditLogFor } from '../../../../lib/db/audit';
import { asStr, filterRows } from '../../../../lib/store';
import { createIncidentCategory, listIncidentCategories } from '../../../../lib/admin/template-service';
import { canDeleteConfig } from '../../../../lib/admin/lifecycle-policy';
import { listIncidentCategoryIdsInUse } from '../../../../lib/incidents';
import { ensureSheet } from '../../../../lib/google/sheets';
import { STATIC_SHEETS } from '../../../../lib/google/branch-schema';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;
  const branchFilter = new URL(_req.url).searchParams.get('branchId');
  const cabangs = await getCabangList();
  const targets = cabangs.filter((c) => ctx.branchIds.includes(c.Cabang_ID) && (!branchFilter || c.Cabang_ID === branchFilter));
  const categories: Record<string, unknown>[] = [];
  for (const cabang of targets) {
    if (!cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try { spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId; } catch { continue; }
    const list = await listIncidentCategories(spreadsheetId);
    for (const c of list) {
      categories.push({
        id: c.id, name: c.name, sortOrder: c.sort_order, isActive: c.is_active,
        points: c.points, penaltyMinSeverity: c.penalty_min_severity,
        createdAt: c.created_at, branchId: cabang.Cabang_ID,
        branchName: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
      });
    }
  }
  const archivedCategories = categories.filter((category) => category['isActive'] === false);
  const usedCategoryIds = archivedCategories.length > 0
    ? await listIncidentCategoryIdsInUse(ctx)
    : new Set<string>();
  for (const category of categories) {
    // Kelayakan memakai policy yang sama dengan route DELETE, supaya tombol di
    // UI tidak pernah berbeda dengan keputusan server.
    category['canDelete'] = canDeleteConfig('incident_category', {
      isActive: category['isActive'] === true,
      inUse: usedCategoryIds.has(asStr(category['id'])),
    });
  }
  categories.sort((a, b) => (Number(a['sortOrder']) || 0) - (Number(b['sortOrder']) || 0));
  return NextResponse.json({ categories });
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;
  let body: { name?: string; sortOrder?: number; sort_order?: number; isActive?: boolean; is_active?: boolean; branchId?: string; points?: number; penaltyMinSeverity?: string } = {};
  try { body = (await _req.json()) as typeof body; } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'Nama kategori minimal 2 karakter' }, { status: 400 });
  const points = Number(body.points ?? 0);
  const threshold = body.penaltyMinSeverity ?? 'none';
  if (!Number.isInteger(points) || points < 0) return NextResponse.json({ error: 'points harus integer non-negatif' }, { status: 400 });
  if (!['none', 'rendah', 'sedang', 'tinggi'].includes(threshold)) return NextResponse.json({ error: 'threshold severity tidak valid' }, { status: 400 });
  const branchId = body.branchId ?? ctx.branchIds[0];
  if (!branchId) return NextResponse.json({ error: 'branchId wajib diisi' }, { status: 400 });
  let spreadsheetId = '';
  try { spreadsheetId = (await resolveCabang(branchId)).spreadsheetId; } catch {
    return NextResponse.json({ error: 'Cabang tidak ditemukan' }, { status: 404 });
  }
  try { await ensureSheet(spreadsheetId, 'IncidentCategories', STATIC_SHEETS['IncidentCategories']); } catch { /* lanjut */ }
  const existing = await filterRows(spreadsheetId, 'IncidentCategories', (r) => asStr(r['name']).toLowerCase() === name.toLowerCase());
  if (existing[0]) return NextResponse.json({ error: `Kategori incident '${name}' sudah ada.` }, { status: 400 });
  const created = await createIncidentCategory(spreadsheetId, {
    name, sort_order: Number(body.sortOrder ?? body.sort_order) || 0,
    is_active: body.isActive ?? body.is_active ?? true, points, penalty_min_severity: threshold,
  });
  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id, action: 'create_incident_category', objectType: 'incident_category',
    objectId: created.id, branchId, after: { name },
  });
  return NextResponse.json({ message: 'Kategori incident berhasil dibuat', categoryId: created.id, branchId });
});
