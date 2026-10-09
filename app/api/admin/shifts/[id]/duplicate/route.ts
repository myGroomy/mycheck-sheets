import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateShiftDefinition } from '../../../../../../lib/admin/resolve-config';
import {
  duplicateShiftDefinition,
  getShiftDefinition,
} from '../../../../../../lib/admin/template-service';

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  // /api/admin/shifts/[id]/duplicate -> id di index length - 2
  const sourceId = pathParts[pathParts.length - 2];

  const loc = await locateShiftDefinition(ctx, sourceId);
  if (!loc) {
    return NextResponse.json({ error: 'Definisi shift tidak ditemukan' }, { status: 404 });
  }

  const copy = await duplicateShiftDefinition(loc.spreadsheetId, sourceId);
  const full = await getShiftDefinition(loc.spreadsheetId, copy.id);

  return NextResponse.json(
    {
      message: 'Definisi shift berhasil diduplikasi (beserta kategori, point, dan handover field)',
      shift: full
        ? {
            id: full.id,
            branchId: loc.branchId,
            name: full.name,
            startTime: full.start_time,
            endTime: full.end_time,
            crossesMidnight: full.crosses_midnight,
            sortOrder: full.sort_order,
            isActive: full.is_active,
            createdAt: full.created_at,
            version: full.version,
          }
        : null,
    },
    { status: 201 }
  );
});