// app/api/incidents/[id]/route.ts Phase 4 (Sheets).
// GET: detail + notes + photos. PATCH (admin): ubah status open<->selesai (IN-04).
import { NextResponse } from 'next/server';
import { requireBranchAccess, requireRole, withAuth } from '../../../../lib/api-auth';
import { appendAuditLogFor } from '../../../../lib/db/audit';
import { asBool, asStr, filterRows, listMonthlyRows } from '../../../../lib/store';
import { categoryNameMap, findIncidentAcrossBranches, incidentTabMonth, pushNotification, updateIncidentRow, userNameMap } from '../../../../lib/incidents';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const incidentId = new URL(_req.url).pathname.split('/').at(-1) ?? '';
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

export const PATCH = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;
  const incidentId = new URL(_req.url).pathname.split('/').at(-1) ?? '';
  let body: { status?: string; linkToShiftId?: string; unlink?: boolean } = {};
  try { body = (await _req.json()) as typeof body; } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const wantsLink = body.linkToShiftId !== undefined || body.unlink === true;
  const wantsStatus = body.status !== undefined;

  if (!wantsLink && !wantsStatus) {
    return NextResponse.json({ error: 'Tidak ada perubahan yang diminta.' }, { status: 400 });
  }
  if (wantsStatus && body.status !== 'open' && body.status !== 'selesai') {
    return NextResponse.json({ error: 'status harus open atau selesai.' }, { status: 400 });
  }

  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 });
  const { spreadsheetId, branchId, incident } = located;
  const tabMonth = incidentTabMonth(incident);
  const now = new Date().toISOString();

  // ---- Tautkan ke shift (ADM-IN-03) ----------------------------------------
  // Incident "di luar shift" berdiri sendiri; admin boleh menautkannya ke shift
  // yang tepat, atau melepaskannya lagi kembali berdiri sendiri.
  if (wantsLink) {
    const previousShiftId = asStr(incident['shift_instance_id']);
    let nextShiftId = '';

    if (body.unlink === true) {
      nextShiftId = '';
    } else {
      const target = String(body.linkToShiftId ?? '').trim();
      if (!target) {
        return NextResponse.json(
          { error: 'linkToShiftId wajib diisi, atau kirim unlink: true.' },
          { status: 400 }
        );
      }
      // Shift tujuan harus milik cabang yang sama dengan incident.
      const candidates = await filterRows(
        spreadsheetId,
        'ShiftInstances',
        (r) => asStr(r['id']) === target
      );
      if (!candidates[0]) {
        return NextResponse.json(
          { error: 'Shift tidak ditemukan di cabang incident ini.' },
          { status: 404 }
        );
      }
      nextShiftId = target;
    }

    if (previousShiftId !== nextShiftId) {
      const ok = await updateIncidentRow(spreadsheetId, tabMonth, incidentId, {
        shift_instance_id: nextShiftId,
        // Menautkan berarti incident bukan lagi "di luar shift".
        outside_shift: nextShiftId === '' ? true : false,
        link_source: body.unlink === true ? 'admin_unlink' : 'admin',
        linked_by: ctx.user.id,
        linked_at: now,
        updated_at: now,
        version: (Number(incident['version']) || 1) + 1,
      });
      if (!ok) return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 });

      // Sinkronkan index supaya daftar incident lintas cabang ikut benar.
      try {
        const { listRowsWithNumber } = await import('../../../../lib/store');
        const { updateRow } = await import('../../../../lib/store');
        const numbered = await listRowsWithNumber(spreadsheetId, 'IncidentIndex');
        const hit = numbered.find((r) => asStr(r.data['incident_id']) === incidentId);
        if (hit) {
          await updateRow(spreadsheetId, 'IncidentIndex', hit.rowNumber, {
            shift_instance_id: nextShiftId,
            outside_shift: nextShiftId === '',
            updated_at: now,
          });
        }
      } catch {
        // index boleh tidak ada
      }

      await appendAuditLogFor(spreadsheetId, {
        actorId: ctx.user.id,
        action: 'link_incident_shift',
        objectType: 'incident',
        objectId: incidentId,
        branchId,
        shiftInstanceId: nextShiftId || previousShiftId || undefined,
        before: { shiftInstanceId: previousShiftId, outsideShift: asBool(incident['outside_shift']) },
        after: { shiftInstanceId: nextShiftId, outsideShift: nextShiftId === '' },
      });
    }
  }

  // ---- Ubah status (IN-04 / ADM-IN-02) -------------------------------------
  if (wantsStatus) {
    const before = asStr(incident['status']);
    if (before === body.status) {
      return NextResponse.json({ status: 'tidak_berubah', incident_id: incidentId });
    }
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
  }

  return NextResponse.json({ status: 'diperbarui', incident_id: incidentId });
});
