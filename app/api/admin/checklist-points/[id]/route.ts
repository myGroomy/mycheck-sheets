import { NextResponse } from 'next/server';
import { inputTypeSchema } from '@/lib/shared';
import { normalizeInputTypes } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { decidePermanentDelete } from '../../../../../lib/admin/lifecycle-policy';
import {
  locateChecklistPoint,
  locateSopCategory,
} from '../../../../../lib/admin/resolve-config';
import {
  checklistPointHasEntryHistory,
  deleteChecklistPoint,
  listChecklistPoints,
  shiftInstanceCount,
  updateChecklistPoint,
} from '../../../../../lib/admin/template-service';

const toApiPoint = (p: {
  id: string;
  title: string;
  instruction: string | null;
  input_type: string;
  input_types: string[];
  options: string[] | null;
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
  inputTypes: p.input_types,
  options: p.options,
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

  const loc = await locateChecklistPoint(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body['title'] !== undefined) updates['title'] = String(body['title']).trim();
  if (body['instruction'] !== undefined) {
    updates['instruction'] = body['instruction'] ? String(body['instruction']) : null;
  }
  const inputType = body['inputType'] ?? body['input_type'];
  const rawInputTypes = body['inputTypes'];
  let nextInputTypes: string[] | undefined;
  if (rawInputTypes !== undefined) {
    if (!Array.isArray(rawInputTypes) || rawInputTypes.length === 0 || !rawInputTypes.every((type) => inputTypeSchema.safeParse(type).success) || new Set(rawInputTypes).size !== rawInputTypes.length) {
      return NextResponse.json({ error: 'Daftar tipe input tidak valid.' }, { status: 400 });
    }
    nextInputTypes = rawInputTypes as string[];
    updates['input_types'] = nextInputTypes;
    updates['input_type'] = nextInputTypes[0];
  }
  if (inputType !== undefined) {
    const parsed = inputTypeSchema.safeParse(inputType);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'inputType tidak valid', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    if (nextInputTypes === undefined) {
      nextInputTypes = [parsed.data];
      updates['input_types'] = nextInputTypes;
    }
    updates['input_type'] = parsed.data;
  }
  const current =
    body['options'] !== undefined || inputType !== undefined || rawInputTypes !== undefined
      ? (await listChecklistPoints(loc.spreadsheetId, loc.sopCategoryId)).find((point) => point.id === id)
      : undefined;
  const effectiveInputTypes = nextInputTypes ?? normalizeInputTypes(current?.input_types, current?.input_type ?? '');
  const requiresOptions = effectiveInputTypes.some((type) => ['pilihan_ganda', 'kotak_centang', 'dropdown'].includes(type));
  if (body['options'] !== undefined) {
    const rawOptions = body['options'];
    if (
      !Array.isArray(rawOptions) ||
      !rawOptions.every((option: unknown) => typeof option === 'string')
    ) {
      return NextResponse.json({ error: 'options harus berupa daftar teks' }, { status: 400 });
    }
    const options = rawOptions.map((option: string) => option.trim()).filter(Boolean);
    if (requiresOptions && options.length === 0) {
      return NextResponse.json({ error: 'Tambahkan minimal satu opsi jawaban' }, { status: 400 });
    }
    if (new Set(options).size !== options.length) {
      return NextResponse.json({ error: 'Opsi jawaban tidak boleh duplikat' }, { status: 400 });
    }
    updates['options'] = options.length ? options : null;
  } else if (
    updates['input_type'] !== undefined &&
    !requiresOptions
  ) {
    updates['options'] = null;
  } else if (
    updates['input_type'] !== undefined &&
    requiresOptions &&
    (!current?.options || current.options.length === 0)
  ) {
    return NextResponse.json(
      { error: 'Tambahkan opsi jawaban sebelum mengubah tipe menjadi pilihan' },
      { status: 400 }
    );
  }
  if ((body['isRequired'] ?? body['is_required']) !== undefined) {
    updates['is_required'] = Boolean(body['isRequired'] ?? body['is_required']);
  }
  if (body['targetTime'] !== undefined) {
    updates['target_time'] = body['targetTime'] ? String(body['targetTime']) : null;
  }
  if ((body['toleranceMinutes'] ?? body['tolerance_minutes']) !== undefined) {
    const v = Number(body['toleranceMinutes'] ?? body['tolerance_minutes']);
    updates['tolerance_minutes'] = Number.isFinite(v) ? v : null;
  }
  if (body['activeDays'] !== undefined) {
    updates['active_days'] = body['activeDays'] ? String(body['activeDays']) : null;
  }
  if ((body['numberMin'] ?? body['number_min']) !== undefined) {
    const v = Number(body['numberMin'] ?? body['number_min']);
    updates['number_min'] = Number.isFinite(v) ? v : null;
  }
  if ((body['numberMax'] ?? body['number_max']) !== undefined) {
    const v = Number(body['numberMax'] ?? body['number_max']);
    updates['number_max'] = Number.isFinite(v) ? v : null;
  }
  if ((body['sortOrder'] ?? body['sort_order']) !== undefined) {
    updates['sort_order'] = Number(body['sortOrder'] ?? body['sort_order']) || 0;
  }
  if ((body['isActive'] ?? body['is_active']) !== undefined) {
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

export const DELETE = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateChecklistPoint(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }
  const point = (await listChecklistPoints(loc.spreadsheetId, loc.sopCategoryId, true))
    .find((item) => item.id === id);
  if (!point) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  // Point pada shift yang sudah punya instance historis tidak boleh dihapus
  // (Entries historis mengreferensikan point_ref ini). Induk yang tidak
  // terverifikasi diperlakukan sama: fail closed.
  const parent = await locateSopCategory(ctx, loc.sopCategoryId);
  const instances = parent
    ? await shiftInstanceCount(loc.spreadsheetId, parent.shiftDefinitionId, true)
    : 0;
  const hasEntryHistory = await checklistPointHasEntryHistory(loc.spreadsheetId, id);

  const decision = decidePermanentDelete('checklist_point', {
    isActive: point.is_active,
    parentVerified: Boolean(parent),
    hasShiftHistory: instances > 0,
    hasEntryRefs: hasEntryHistory,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason, shiftInstances: instances },
      { status: decision.status }
    );
  }

  await deleteChecklistPoint(loc.spreadsheetId, id);
  await appendAuditLogFor(loc.spreadsheetId, {
    actorId: ctx.user.id,
    action: 'delete_checklist_point',
    objectType: 'checklist_point',
    objectId: id,
    branchId: loc.branchId,
    before: { id, title: point.title, isActive: point.is_active },
    after: { deleted: true },
  });

  return NextResponse.json({ message: 'Checklist point berhasil dihapus' });
});