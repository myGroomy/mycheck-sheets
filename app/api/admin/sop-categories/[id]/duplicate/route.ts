import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateSopCategory } from '../../../../../../lib/admin/resolve-config';
import { duplicateSopCategory } from '../../../../../../lib/admin/template-service';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const sourceId = pathParts[pathParts.length - 2];

  const loc = await locateSopCategory(ctx, sourceId);
  if (!loc) {
    return NextResponse.json({ error: 'Kategori SOP tidak ditemukan' }, { status: 404 });
  }

  const copy = await duplicateSopCategory(loc.spreadsheetId, sourceId);

  return NextResponse.json(
    {
      message: 'Kategori SOP berhasil diduplikasi (beserta checklist point-nya)',
      category: {
        id: copy.id,
        shiftDefinitionId: copy.shift_definition_id,
        name: copy.name,
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