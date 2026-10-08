import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateShiftDefinition } from '../../../../../../lib/admin/resolve-config';
import {
  createSopCategory,
  listSopCategories,
} from '../../../../../../lib/admin/template-service';

const toApiCategory = (c: {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}) => ({
  id: c.id,
  name: c.name,
  sortOrder: c.sort_order,
  isActive: c.is_active,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  version: c.version,
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const shiftId = pathParts[pathParts.length - 2];

  const loc = await locateShiftDefinition(ctx, shiftId);
  if (!loc) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }

  const categories = await listSopCategories(loc.spreadsheetId, shiftId);

  return NextResponse.json({
    categories: categories.map((c) => ({
      ...toApiCategory(c),
      shiftDefinitionId: shiftId,
      branchId: loc.branchId,
    })),
  });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const shiftId = pathParts[pathParts.length - 2];

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const name = String(body['name'] ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name wajib diisi' }, { status: 400 });
  }

  const loc = await locateShiftDefinition(ctx, shiftId);
  if (!loc) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }

  const created = await createSopCategory(loc.spreadsheetId, {
    shift_definition_id: shiftId,
    name,
    sort_order: Number(body['sortOrder'] ?? body['sort_order'] ?? 0) || 0,
    is_active: Boolean(body['isActive'] ?? body['is_active'] ?? true),
  });

  return NextResponse.json(
    {
      message: 'Kategori SOP berhasil dibuat',
      category: { ...toApiCategory(created), shiftDefinitionId: shiftId, branchId: loc.branchId },
    },
    { status: 201 }
  );
});