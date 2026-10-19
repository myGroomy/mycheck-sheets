import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateShiftDefinition } from '../../../../../../lib/admin/resolve-config';
import {
  createSopCategory,
  listSopCategories,
  shiftInstanceCount,
} from '../../../../../../lib/admin/template-service';
import { canDeleteConfig } from '../../../../../../lib/admin/lifecycle-policy';
import { normalizeSectionColor } from '../../../../../../lib/shared/section-color';
import { asStr, filterRows } from '../../../../../../lib/store';

const toApiCategory = (c: {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
  color?: string | null;
}) => ({
  id: c.id,
  name: c.name,
  sortOrder: c.sort_order,
  isActive: c.is_active,
  ...(c.color !== undefined ? { color: c.color } : {}),
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  version: c.version,
});

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const shiftId = pathParts[pathParts.length - 2];

  const loc = await locateShiftDefinition(ctx, shiftId);
  if (!loc) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }

  const categories = await listSopCategories(loc.spreadsheetId, shiftId);
  const hasShiftHistory = (await shiftInstanceCount(loc.spreadsheetId, shiftId)) > 0;
  // Jumlah item per kategori diambil dalam satu pembacaan supaya kelayakan
  // hapus kategori tidak memerlukan satu request per kategori.
  const categoryIds = new Set(categories.map((category) => category.id));
  const pointRows = await filterRows(
    loc.spreadsheetId,
    'ChecklistPoints',
    (row) => categoryIds.has(asStr(row['sop_category_id']))
  );
  const pointCounts: Record<string, number> = {};
  for (const row of pointRows) {
    const categoryId = asStr(row['sop_category_id']);
    pointCounts[categoryId] = (pointCounts[categoryId] ?? 0) + 1;
  }

  return NextResponse.json({
    categories: categories.map((c) => ({
      ...toApiCategory(c),
      shiftDefinitionId: shiftId,
      branchId: loc.branchId,
      hasShiftHistory,
      canDelete: canDeleteConfig('sop_category', {
        isActive: c.is_active,
        hasShiftHistory,
        hasChildren: (pointCounts[c.id] ?? 0) > 0,
      }),
    })),
  });
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const shiftId = pathParts[pathParts.length - 2];

  let body: Record<string, unknown>;
  try {
    body = (await _req.json()) as Record<string, unknown>;
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
    color: typeof body['color'] === 'string' ? normalizeSectionColor(body['color']) : undefined,
  });

  return NextResponse.json(
    {
      message: 'Kategori SOP berhasil dibuat',
      category: { ...toApiCategory(created), shiftDefinitionId: shiftId, branchId: loc.branchId },
    },
    { status: 201 }
  );
});