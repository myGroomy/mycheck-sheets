// app/api/incidents/[id]/route.ts — Phase 4 (Sheets).
// GET: detail + notes + photos. PATCH (admin): ubah status open<->selesai (IN-04).
import { NextRequest, NextResponse } from 'next/server';
import { requireBranchAccess, requireRole, withAuth } from '../../../../lib/api-auth';
import { appendAuditLogFor } from '../../../../lib/db/audit';
import { asBool, asStr, listMonthlyRows } from '../../../../lib/store';
import { categoryNameMap, findIncidentAcrossBranches, incidentTabMonth, pushNotification, updateIncidentRow, userNameMap } from '../../../../lib/incidents';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const incidentId = new URL(req.url).pathname.split('/').at(-1) ?? '';
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 });
  const branchAccessError = requireBranchAccess(ctx, located.branchId);
  if (branchAccessError) return branchAccessError;
  const { spreadsheetId, branchId, incident } = located;
  const tabMonth = incidentTabMonth(incident);
  const [nameByUsername, categoryNames] = await Promise.all([userNameMap(), categoryNameMap(ctx)]);
  const noteRows = await listMonthlyRows(spreadsheetId, 'IncidentNotes', tabMonth);
  const notes = noteRows
    .filter((n) => asStr(n['incident_id']) === incidentId)
    .sort((a, b) => asStr(a['created_at']).localeCompare(asStr(b['created_at'])))
    .map((n) => ({
      id: asStr(n['id']), note: asStr(n['note']),
      authorName: nameByUsername.get(asStr(n['author_id'])) ?? asStr(n['author_id']),
      authorRole: asStr(n['author_role']), createdAt: asStr(n['created_at']),
    }));
  const photoRows = await listMonthlyRows(spreadsheetId, 'Photos', tabMonth);
  const photos = photoRows
    .filter((p) => asStr(p['owner_type']) === 'incident' && asStr(p['owner_id']) === incidentId)
    .map((p) => ({ id: asStr(p['id']), uploadedAt: asStr(p['uploaded_at']) || null, status: asStr(p['status']) }));
  const { getCabangList } = await import('../../../../lib/google/registry');
  const cabangs = await getCabangList();
  const cabang = cabangs.find((c) => c.Cabang_ID === branchId);
  const response = NextResponse.json({
    incident: {
      id: asStr(incident['id']), branchId,
      branchName: (cabang?.['Nama_Cabang'] as string) || branchId,
      shiftInstanceId: asStr(incident['shift_instance_id']) || null,
      categoryId: asStr(incident['category_id']),
      categoryName: categoryNames.get(asStr(incident['category_id'])) ?? '',
      description: asStr(incident['description']),
      occurredAt: asStr(incident['occurred_at']), reportedAt: asStr(incident['reported_at']),
      reportedByName: nameByUsername.get(asStr(incident['reported_by'])) ?? asStr(incident['reported_by']),
      status: asStr(incident['status']), severity: asStr(incident['severity']) || null,
      outsideShift: asBool(incident['outside_shift']),
    },
    notes, photos,
  });
  response.headers.set('Cache-Control', 'private, max-age=30, must-revalidate');
  response.headers.set('Vary', 'Cookie');
  return response;
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;
  const incidentId = new URL(req.url).pathname.split('/').at(-1) ?? '';
  let body: { status?: string } = {};
  try { body = (await req.json()) as { status?: string }; } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }
  if (body.status !== 'open' && body.status !== 'selesai') {
    return NextResponse.json({ error: 'status harus open atau selesai.' }, { status: 400 });
  }
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 });
  const { spreadsheetId, branchId, incident } = located;
  const tabMonth = incidentTabMonth(incident);
  const before = asStr(incident['status']);
  if (before === body.status) return NextResponse.json({ status: 'tidak_berubah', incident_id: incidentId });
  const now = new Date().toISOString();
  const ok = await updateIncidentRow(spreadsheetId, tabMonth, incidentId, {
    status: body.status, status_changed_by: ctx.user.id, status_changed_at: now, updated_at: now, version: (Number(incident['version']) || 1) + 1,
  });
  if (!ok) return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 });
  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id, action: 'update_incident_status', objectType: 'incident', objectId: incidentId,
    branchId, shiftInstanceId: asStr(incident['shift_instance_id']) || undefined,
    before: { status: before }, after: { status: body.status },
  });
  try {
    await pushNotification(spreadsheetId, {
      userId: asStr(incident['reported_by']), type: 'incident_status',
      title: `Incident ${body.status === 'selesai' ? 'selesai' : 'dibuka kembali'}`,
      body: asStr(incident['description']).slice(0, 140), link: `/incident/${incidentId}`,
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ status: 'diperbarui', incident_id: incidentId });
});
