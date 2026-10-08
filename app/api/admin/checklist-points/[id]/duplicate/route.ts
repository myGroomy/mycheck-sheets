import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateChecklistPoint } from '../../../../../../lib/admin/resolve-config';
import { duplicateChecklistPoint } from '../../../../../../lib/admin/template-service';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const sourceId = pathParts[pathParts.length - 2];

  const loc = await locateChecklistPoint(ctx, sourceId);
  if (!loc) {
    return NextResponse.json({ error: 'Checklist point tidak ditemukan' }, { status: 404 });
  }

  const copy = await duplicateChecklistPoint(loc.spreadsheetId, sourceId);

  return NextResponse.json(
    {
      message: 'Checklist point berhasil diduplikasi',
      point: {
        id: copy.id,
        sopCategoryId: copy.sop_category_id,
        title: copy.title,
        inputType: copy.input_type,
        isRequired: copy.is_required,
        sortOrder: copy.sort_order,
        isActive: copy.is_active,
        createdAt: copy.created_at,
        version: copy.version,
        branchId: loc.branchId,
      },
    },
    { status: 201 }
  );
});