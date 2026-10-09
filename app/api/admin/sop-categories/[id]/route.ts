import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { locateSopCategory } from '../../../../../lib/admin/resolve-config';
import {
  deleteSopCategory,
  listChecklistPoints,
  listSopCategories,
  shiftInstanceCount,
  updateSopCategory,
} from '../../../../../lib/admin/template-service';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateSopCategory(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Kategori SOP tidak ditemukan' }, { status: 404 });
  }

  const categories = await listSopCategories(loc.spreadsheetId, loc.shiftDefinitionId);
  const category = categories.find((c) => c.id === id);
  if (!category) {
    return NextResponse.json({ error: 'Kategori SOP tidak ditemukan' }, { status: 404 });
  }

  const points = await listChecklistPoints(loc.spreadsheetId, id);

  return NextResponse.json({
    category: {
      id: category.id,
      shiftDefinitionId: category.shift_definition_id,
      name: category.name,
      sortOrder: category.sort_order,
      isActive: category.is_active,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
      version: category.version,
      branchId: loc.branchId,
    },
    points: points.map((p) => ({
      id: p.id,
      title: p.title,
      inputType: p.input_type,
      isRequired: p.is_required,
      sortOrder: p.sort_order,
      isActive: p.is_active,
    })),
  });
});

export const PUT = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  let body: Record<string, unknown>;
  try {
    body = (await _req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const loc = await locateSopCategory(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Kategori SOP tidak ditemukan' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body['name'] !== undefined) updates['name'] = String(body['name']).trim();
  if (body['sortOrder'] ?? body['sort_order']) {
    updates['sort_order'] = Number(body['sortOrder'] ?? body['sort_order']) || 0;
  }
  if (body['isActive'] ?? body['is_active']) {
    updates['is_active'] = Boolean(body['isActive'] ?? body['is_active']);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: 'Tidak ada perubahan' });
  }

  await updateSopCategory(loc.spreadsheetId, id, updates);

  return NextResponse.json({ message: 'Kategori SOP berhasil diperbarui' });
});

export const DELETE = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateSopCategory(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Kategori SOP tidak ditemukan' }, { status: 404 });
  }

  // Kategori yang sudah dipakai shift instance historis tidak bisa dihapus
  const instances = await shiftInstanceCount(loc.spreadsheetId, loc.shiftDefinitionId);
  const points = await listChecklistPoints(loc.spreadsheetId, id);

  if (instances > 0) {
    return NextResponse.json(
      {
        error:
          'Kategori sudah terpotret pada shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
        shiftInstances: instances,
      },
      { status: 409 }
    );
  }

  if (points.length > 0) {
    return NextResponse.json(
      {
        error: 'Kategori masih memiliki checklist point. Hapus atau pindahkan pointnya dulu.',
        points: points.length,
      },
      { status: 409 }
    );
  }

  await deleteSopCategory(loc.spreadsheetId, id);

  return NextResponse.json({ message: 'Kategori SOP berhasil dihapus' });
});