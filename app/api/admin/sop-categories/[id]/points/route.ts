import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateSopCategory } from '../../../../../../lib/admin/resolve-config';
import {
  createChecklistPoint,
  listChecklistPoints,
} from '../../../../../../lib/admin/template-service';
import { inputTypeSchema } from '@/lib/shared';

const toApiPoint = (p: {
  id: string;
  title: string;
  instruction: string | null;
  input_type: string;
  is_required: boolean;
  target_time: string | null;
  tolerance_minutes: number | null;
  active_days: string | null;
  number_min: number | null;
  number_max: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}) => ({
  id: p.id,
  title: p.title,
  instruction: p.instruction,
  inputType: p.input_type,
  isRequired: p.is_required,
  targetTime: p.target_time,
  toleranceMinutes: p.tolerance_minutes,
  activeDays: p.active_days,
  numberMin: p.number_min,
  numberMax: p.number_max,
  sortOrder: p.sort_order,
  isActive: p.is_active,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  version: p.version,
});

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const categoryId = pathParts[pathParts.length - 2];

  const loc = await locateSopCategory(ctx, categoryId);
  if (!loc) {
    return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 });
  }

  const points = await listChecklistPoints(loc.spreadsheetId, categoryId);

  return NextResponse.json({
    points: points.map((p) => ({
      ...toApiPoint(p),
      sopCategoryId: categoryId,
      branchId: loc.branchId,
    })),
  });
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const categoryId = pathParts[pathParts.length - 2];

  let body: Record<string, unknown>;
  try {
    body = (await _req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const title = String(body['title'] ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'title wajib diisi' }, { status: 400 });
  }

  const inputTypeParsed = inputTypeSchema.safeParse(body['inputType'] ?? body['input_type']);
  if (!inputTypeParsed.success) {
    return NextResponse.json(
      { error: 'inputType tidak valid', details: inputTypeParsed.error.flatten() },
      { status: 400 }
    );
  }

  const loc = await locateSopCategory(ctx, categoryId);
  if (!loc) {
    return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 });
  }

  const created = await createChecklistPoint(loc.spreadsheetId, {
    sop_category_id: categoryId,
    title,
    instruction: body['instruction'] ? String(body['instruction']) : null,
    input_type: inputTypeParsed.data,
    is_required: Boolean(body['isRequired'] ?? body['is_required'] ?? true),
    target_time: body['targetTime'] ? String(body['targetTime'] ?? body['target_time']) : null,
    tolerance_minutes:
      body['toleranceMinutes'] ?? body['tolerance_minutes']
        ? Number(body['toleranceMinutes'] ?? body['tolerance_minutes'])
        : null,
    active_days: body['activeDays'] ? String(body['activeDays'] ?? body['active_days']) : null,
    number_min:
      body['numberMin'] ?? body['number_min'] != null
        ? Number(body['numberMin'] ?? body['number_min'])
        : null,
    number_max:
      body['numberMax'] ?? body['number_max'] != null
        ? Number(body['numberMax'] ?? body['number_max'])
        : null,
    sort_order: Number(body['sortOrder'] ?? body['sort_order'] ?? 0) || 0,
    is_active: Boolean(body['isActive'] ?? body['is_active'] ?? true),
  });

  return NextResponse.json(
    {
      message: 'Point checklist berhasil dibuat',
      point: { ...toApiPoint(created), sopCategoryId: categoryId, branchId: loc.branchId },
    },
    { status: 201 }
  );
});