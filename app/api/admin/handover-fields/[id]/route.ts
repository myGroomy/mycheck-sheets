import { NextRequest, NextResponse } from 'next/server';
import { handoverFieldTypeSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { locateHandoverField } from '../../../../../lib/admin/resolve-config';
import {
  deleteHandoverField,
  listHandoverFields,
  shiftInstanceCount,
  updateHandoverField,
} from '../../../../../lib/admin/template-service';

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

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateHandoverField(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Bidang handover tidak ditemukan' }, { status: 404 });
  }

  const fields = await listHandoverFields(loc.spreadsheetId, loc.shiftDefinitionId);
  const field = fields.find((f) => f.id === id);
  if (!field) {
    return NextResponse.json({ error: 'Bidang handover tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json({
    field: {
      ...toApiField(field),
      shiftDefinitionId: field.shift_definition_id,
      branchId: loc.branchId,
    },
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

  const loc = await locateHandoverField(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Bidang handover tidak ditemukan' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body['label'] !== undefined) updates['label'] = String(body['label']).trim();
  if (body['fieldType'] ?? body['field_type']) {
    const parsed = handoverFieldTypeSchema.safeParse(body['fieldType'] ?? body['field_type']);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'fieldType tidak valid', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    updates['field_type'] = parsed.data;
  }
  if (body['options'] !== undefined) {
    const opts = body['options'];
    updates['options'] = Array.isArray(opts) ? opts.map(String) : null;
  }
  if (body['isRequired'] ?? body['is_required']) {
    updates['is_required'] = Boolean(body['isRequired'] ?? body['is_required']);
  }
  if (body['sortOrder'] ?? body['sort_order']) {
    updates['sort_order'] = Number(body['sortOrder'] ?? body['sort_order']) || 0;
  }
  if (body['isActive'] ?? body['is_active']) {
    updates['is_active'] = Boolean(body['isActive'] ?? body['is_active']);
  }

  const finalType = (updates['field_type'] as string) ?? undefined;
  const finalOptions = (updates['options'] as string[] | null) ?? undefined;
  if (finalType === 'pilihan' && finalOptions !== undefined && finalOptions.length === 0) {
    return NextResponse.json(
      { error: 'Field bertipe pilihan wajib memiliki minimal satu opsi.' },
      { status: 400 }
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: 'Tidak ada perubahan' });
  }

  await updateHandoverField(loc.spreadsheetId, id, updates);

  return NextResponse.json({ message: 'Bidang handover berhasil diperbarui' });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const loc = await locateHandoverField(ctx, id);
  if (!loc) {
    return NextResponse.json({ error: 'Bidang handover tidak ditemukan' }, { status: 404 });
  }

  const instances = await shiftInstanceCount(loc.spreadsheetId, loc.shiftDefinitionId);
  if (instances > 0) {
    return NextResponse.json(
      {
        error:
          'Bidang handover sudah dipakai shift instance sehingga tidak bisa dihapus. Nonaktifkan saja.',
        shiftInstances: instances,
      },
      { status: 409 }
    );
  }

  await deleteHandoverField(loc.spreadsheetId, id);

  return NextResponse.json({ message: 'Bidang handover berhasil dihapus' });
});