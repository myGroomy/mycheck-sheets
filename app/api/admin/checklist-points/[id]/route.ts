import { NextRequest, NextResponse } from 'next/server';
import { inputTypeSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { locateChecklistPoint } from '../../../../../lib/admin/resolve-config';
import {
  deleteChecklistPoint,
  listChecklistPoints,
  updateChecklistPoint,
} from '../../../../../lib/admin/template-service';

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

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateChecklistPoint(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  const points = await listChecklistPoints(loc.spreadsheetId, loc.sopCategoryId);
  const point = points.find((p) => p.id === id);
  if (!point) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json({
    point: { ...toApiPoint(point), sopCategoryId: loc.sopCategoryId, branchId: loc.branchId },
  });
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

  const loc = await locateChecklistPoint(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body['title'] !== undefined) updates['title'] = String(body['title']).trim();
  if (body['instruction'] !== undefined) {
    updates['instruction'] = body['instruction'] ? String(body['instruction']) : null;
  }
  if (body['inputType'] ?? body['input_type']) {
    const parsed = inputTypeSchema.safeParse(body['inputType'] ?? body['input_type']);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'inputType tidak valid', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    updates['input_type'] = parsed.data;
  }
  if (body['isRequired'] ?? body['is_required']) {
    updates['is_required'] = Boolean(body['isRequired'] ?? body['is_required']);
  }
  if (body['targetTime'] !== undefined) {
    updates['target_time'] = body['targetTime'] ? String(body['targetTime']) : null;
  }
  if (body['toleranceMinutes'] ?? body['tolerance_minutes']) {
    const v = Number(body['toleranceMinutes'] ?? body['tolerance_minutes']);
    updates['tolerance_minutes'] = Number.isFinite(v) ? v : null;
  }
  if (body['activeDays'] !== undefined) {
    updates['active_days'] = body['activeDays'] ? String(body['activeDays']) : null;
  }
  if (body['numberMin'] ?? body['number_min']) {
    const v = Number(body['numberMin'] ?? body['number_min']);
    updates['number_min'] = Number.isFinite(v) ? v : null;
  }
  if (body['numberMax'] ?? body['number_max']) {
    const v = Number(body['numberMax'] ?? body['number_max']);
    updates['number_max'] = Number.isFinite(v) ? v : null;
  }
  if (body['sortOrder'] ?? body['sort_order']) {
    updates['sort_order'] = Number(body['sortOrder'] ?? body['sort_order']) || 0;
  }
  if (body['isActive'] ?? body['is_active']) {
    updates['is_active'] = Boolean(body['isActive'] ?? body['is_active']);
  }

  // number_min harus <= number_max
  const min = updates['number_min'];
  const max = updates['number_max'];
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    return NextResponse.json(
      { error: 'numberMin tidak boleh lebih besar dari numberMax.' },
      { status: 400 }
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: 'Tidak ada perubahan' });
  }

  await updateChecklistPoint(loc.spreadsheetId, id, updates);

  return NextResponse.json({ message: 'Checklist point berhasil diperbarui' });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateChecklistPoint(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  // Point pada shift yang sudah punya instance historis tidak boleh dihapus
  // ( Entries historis mengreferensikan point_ref ini). Satu pembacaan
  // ShiftDefinitions cukup untuk peasannya.
  const { locateSopCategory } = await import('../../../../../lib/admin/resolve-config');
  const parent = await locateSopCategory(ctx, loc.sopCategoryId);
  if (parent) {
    const { shiftInstanceCount } = await import('../../../../../lib/admin/template-service');
    const instances = await shiftInstanceCount(loc.spreadsheetId, parent.shiftDefinitionId);
    if (instances > 0) {
      return NextResponse.json(
        {
          error:
            'Point berada pada shift yang sudah punya shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
          shiftInstances: instances,
        },
        { status: 409 }
      );
    }
  }

  await deleteChecklistPoint(loc.spreadsheetId, id);

  return NextResponse.json({ message: 'Checklist point berhasil dihapus' });
});