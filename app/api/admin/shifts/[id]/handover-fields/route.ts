import { NextResponse } from 'next/server';
import { handoverFieldTypeSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateShiftDefinition } from '../../../../../../lib/admin/resolve-config';
import {
  createHandoverField,
  listHandoverFields,
} from '../../../../../../lib/admin/template-service';

const toApiField = (f: {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}) => ({
  id: f.id,
  label: f.label,
  fieldType: f.field_type,
  options: f.options,
  isRequired: f.is_required,
  sortOrder: f.sort_order,
  isActive: f.is_active,
  createdAt: f.created_at,
  updatedAt: f.updated_at,
  version: f.version,
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

  const fields = await listHandoverFields(loc.spreadsheetId, shiftId);

  return NextResponse.json({
    fields: fields.map((f) => ({
      ...toApiField(f),
      shiftDefinitionId: shiftId,
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
  const shiftId = pathParts[pathParts.length - 2];

  let body: Record<string, unknown>;
  try {
    body = (await _req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const label = String(body['label'] ?? '').trim();
  if (!label) {
    return NextResponse.json({ error: 'label wajib diisi' }, { status: 400 });
  }

  const fieldTypeParsed = handoverFieldTypeSchema.safeParse(body['fieldType'] ?? body['field_type']);
  if (!fieldTypeParsed.success) {
    return NextResponse.json(
      {
        error: 'fieldType tidak valid',
        details: fieldTypeParsed.error.flatten(),
      },
      { status: 400 }
    );
  }
  const fieldType = fieldTypeParsed.data;

  const rawOptions = (body['options'] ?? null) as string[] | null;
  if (fieldType === 'pilihan' && (!rawOptions || rawOptions.length === 0)) {
    return NextResponse.json(
      { error: 'Field bertipe pilihan wajib memiliki minimal satu opsi.' },
      { status: 400 }
    );
  }

  const loc = await locateShiftDefinition(ctx, shiftId);
  if (!loc) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }

  const created = await createHandoverField(loc.spreadsheetId, {
    shift_definition_id: shiftId,
    label,
    field_type: fieldType,
    options: rawOptions,
    is_required: Boolean(body['isRequired'] ?? body['is_required'] ?? true),
    sort_order: Number(body['sortOrder'] ?? body['sort_order'] ?? 0) || 0,
    is_active: Boolean(body['isActive'] ?? body['is_active'] ?? true),
  });

  return NextResponse.json(
    {
      message: 'Bidang serah terima berhasil dibuat',
      fieldId: created.id,
      field: { ...toApiField(created), shiftDefinitionId: shiftId, branchId: loc.branchId },
    },
    { status: 201 }
  );
});