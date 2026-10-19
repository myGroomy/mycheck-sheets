// app/api/admin/incident-categories/[id]/route.ts Phase 4 (Sheets).
import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { locateIncidentCategory } from '../../../../../lib/admin/resolve-config';
import { deleteIncidentCategory, getIncidentCategory, updateIncidentCategory } from '../../../../../lib/admin/template-service';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { decidePermanentDelete } from '../../../../../lib/admin/lifecycle-policy';
import { asStr, filterRows } from '../../../../../lib/store';
import { isCategoryInUse } from '../../../../../lib/incidents';

export const PUT = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;
  const id = new URL(_req.url).pathname.split('/').pop() ?? '';
  let body: { name?: string; sortOrder?: number; sort_order?: number; isActive?: boolean; is_active?: boolean; points?: number; penaltyMinSeverity?: string } = {};
  try { body = (await _req.json()) as typeof body; } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }
  const loc = await locateIncidentCategory(ctx, id);
  if (!loc) return NextResponse.json({ error: 'Kategori incident tidak ditemukan' }, { status: 404 });
  const existing = await getIncidentCategory(loc.spreadsheetId, id);
  if (!existing) return NextResponse.json({ error: 'Kategori incident tidak ditemukan' }, { status: 404 });
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2) return NextResponse.json({ error: 'Nama kategori minimal 2 karakter' }, { status: 400 });
    const dup = await filterRows(loc.spreadsheetId, 'IncidentCategories', (r) => asStr(r['name']).toLowerCase() === name.toLowerCase() && asStr(r['id']) !== id);
    if (dup[0]) return NextResponse.json({ error: `Kategori incident '${name}' sudah ada.` }, { status: 400 });
    updates['name'] = name;
  }
  if (body.sortOrder ?? body.sort_order) updates['sort_order'] = Number(body.sortOrder ?? body.sort_order) || 0;
  if (body.isActive !== undefined || body.is_active !== undefined) updates['is_active'] = Boolean(body.isActive ?? body.is_active);
  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isInteger(points) || points < 0) return NextResponse.json({ error: 'points harus integer non-negatif' }, { status: 400 });
    updates['points'] = points;
  }
  if (body.penaltyMinSeverity !== undefined) {
    if (!['none', 'rendah', 'sedang', 'tinggi'].includes(body.penaltyMinSeverity)) return NextResponse.json({ error: 'threshold severity tidak valid' }, { status: 400 });
    updates['penalty_min_severity'] = body.penaltyMinSeverity;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ message: 'Tidak ada perubahan' });
  await updateIncidentCategory(loc.spreadsheetId, id, updates);
  await appendAuditLogFor(loc.spreadsheetId, {
    actorId: ctx.user.id, action: 'update_incident_category', objectType: 'incident_category',
    objectId: id, branchId: loc.branchId, before: { ...existing }, after: { ...existing, ...updates },
  });
  return NextResponse.json({ message: 'Kategori incident berhasil diperbarui' });
});

export const DELETE = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;
  const id = new URL(_req.url).pathname.split('/').pop() ?? '';
  const loc = await locateIncidentCategory(ctx, id);
  if (!loc) return NextResponse.json({ error: 'Kategori incident tidak ditemukan' }, { status: 404 });
  const existing = await getIncidentCategory(loc.spreadsheetId, id, true);
  if (!existing) return NextResponse.json({ error: 'Kategori incident tidak ditemukan' }, { status: 404 });

  const inUse = await isCategoryInUse(loc.spreadsheetId, id);
  const decision = decidePermanentDelete('incident_category', {
    isActive: existing.is_active,
    inUse,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message, reason: decision.reason }, { status: decision.status });
  }

  await deleteIncidentCategory(loc.spreadsheetId, id);
  await appendAuditLogFor(loc.spreadsheetId, {
    actorId: ctx.user.id, action: 'delete_incident_category', objectType: 'incident_category',
    objectId: id, branchId: loc.branchId,
    before: { id, name: existing.name, isActive: existing.is_active },
    after: { deleted: true },
  });
  return NextResponse.json({ message: 'Kategori incident berhasil dihapus' });
});
