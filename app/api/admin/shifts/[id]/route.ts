import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { locateShiftDefinition } from '../../../../../lib/admin/resolve-config';
import {
  deleteShiftDefinition,
  getShiftDefinition,
  shiftInstanceCount,
  templateChildCounts,
  updateShiftDefinition,
} from '../../../../../lib/admin/template-service';

function toApiShift(d: Awaited<ReturnType<typeof getShiftDefinition>>, branchId: string) {
  if (!d) return null;
  return {
    id: d.id,
    branchId,
    name: d.name,
    startTime: d.start_time,
    endTime: d.end_time,
    crossesMidnight: d.crosses_midnight,
    sortOrder: d.sort_order,
    isActive: d.is_active,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    version: d.version,
  };
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateShiftDefinition(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Definisi shift tidak ditemukan' }, { status: 404 });
  }

  const definition = await getShiftDefinition(loc.spreadsheetId, id);
  return NextResponse.json({ shift: toApiShift(definition, loc.branchId) });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const loc = await locateShiftDefinition(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Definisi shift tidak ditemukan' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body['name'] !== undefined) updates['name'] = String(body['name']).trim();
  if (body['startTime'] ?? body['start_time']) {
    const v = String(body['startTime'] ?? body['start_time']);
    if (!/^\d{2}:\d{2}$/.test(v)) {
      return NextResponse.json({ error: 'Format startTime harus HH:MM' }, { status: 400 });
    }
    updates['start_time'] = v;
  }
  if (body['endTime'] ?? body['end_time']) {
    const v = String(body['endTime'] ?? body['end_time']);
    if (!/^\d{2}:\d{2}$/.test(v)) {
      return NextResponse.json({ error: 'Format endTime harus HH:MM' }, { status: 400 });
    }
    updates['end_time'] = v;
  }
  if (body['crossesMidnight'] ?? body['crosses_midnight']) {
    updates['crosses_midnight'] = Boolean(body['crossesMidnight'] ?? body['crosses_midnight']);
  }
  if (body['sortOrder'] ?? body['sort_order']) {
    updates['sort_order'] = Number(body['sortOrder'] ?? body['sort_order']) || 0;
  }
  if (body['isActive'] ?? body['is_active']) {
    updates['is_active'] = Boolean(body['isActive'] ?? body['is_active']);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: 'Tidak ada perubahan' });
  }

  await updateShiftDefinition(loc.spreadsheetId, id, updates);

  const definition = await getShiftDefinition(loc.spreadsheetId, id);
  return NextResponse.json({
    message: 'Definisi shift berhasil diperbarui',
    shift: toApiShift(definition, loc.branchId),
  });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateShiftDefinition(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Definisi shift tidak ditemukan' }, { status: 404 });
  }

  // Shift definition yang sudah punya instance historis tidak boleh dihapus
  const instances = await shiftInstanceCount(loc.spreadsheetId, id);
  if (instances > 0) {
    const children = await templateChildCounts(loc.spreadsheetId, id);
    return NextResponse.json(
      {
        error:
          'Definisi shift sudah dipakai oleh shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
        shiftInstances: instances,
        categories: children.categories,
        handoverFields: children.handover_fields,
      },
      { status: 409 }
    );
  }

  // Jangan sampai kategori / handover field tertinggal tanpa induk
  const children = await templateChildCounts(loc.spreadsheetId, id);
  if (children.categories > 0 || children.handover_fields > 0) {
    return NextResponse.json(
      {
        error:
          'Hapus atau pindahkan dulu kategori SOP dan bidang handover milik definisi shift ini.',
        categories: children.categories,
        handoverFields: children.handover_fields,
      },
      { status: 409 }
    );
  }

  await deleteShiftDefinition(loc.spreadsheetId, id);

  return NextResponse.json({ message: 'Definisi shift berhasil dihapus' });
});