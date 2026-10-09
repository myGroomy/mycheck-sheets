import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { locateShiftDefinition } from '../../../../../../lib/admin/resolve-config';
import { resolveCabang } from '../../../../../../lib/google/registry';
import {
  getShiftDefinition,
  listChecklistPoints,
  listHandoverFields,
  listSopCategories,
} from '../../../../../../lib/admin/template-service';

/** Pratinjau template shift: kategori, point, dan bidang handover. */
export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  // /api/admin/shifts/[id]/preview -> shiftId di index length - 2
  const shiftId = pathParts[pathParts.length - 2];

  const loc = await locateShiftDefinition(ctx, shiftId);
  if (!loc) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }

  const definition = await getShiftDefinition(loc.spreadsheetId, shiftId);
  if (!definition) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }

  const { cabang } = await resolveCabang(loc.branchId);

  const hFields = await listHandoverFields(loc.spreadsheetId, shiftId);
  const categories = await listSopCategories(loc.spreadsheetId, shiftId);

  const categoriesWithPoints = [];
  for (const cat of categories) {
    const points = await listChecklistPoints(loc.spreadsheetId, cat.id);
    categoriesWithPoints.push({
      id: cat.id,
      shift_definition_id: cat.shift_definition_id,
      name: cat.name,
      sort_order: cat.sort_order,
      is_active: cat.is_active,
      created_at: cat.created_at,
      updated_at: cat.updated_at,
      version: cat.version,
      points: points.map((p) => ({
        id: p.id,
        sop_category_id: p.sop_category_id,
        title: p.title,
        instruction: p.instruction,
        input_type: p.input_type,
        is_required: p.is_required,
        target_time: p.target_time,
        tolerance_minutes: p.tolerance_minutes,
        active_days: p.active_days,
        number_min: p.number_min,
        number_max: p.number_max,
        sort_order: p.sort_order,
        is_active: p.is_active,
        created_at: p.created_at,
        updated_at: p.updated_at,
        version: p.version,
      })),
    });
  }

  return NextResponse.json({
    shift: {
      id: definition.id,
      name: definition.name,
      startTime: definition.start_time,
      endTime: definition.end_time,
      crossesMidnight: definition.crosses_midnight,
      isActive: definition.is_active,
      branchId: loc.branchId,
      branchName: (cabang['Nama_Cabang'] as string) || loc.branchId,
    },
    handoverFields: hFields.map((f) => ({
      id: f.id,
      shift_definition_id: f.shift_definition_id,
      label: f.label,
      field_type: f.field_type,
      options: f.options,
      is_required: f.is_required,
      sort_order: f.sort_order,
      is_active: f.is_active,
      created_at: f.created_at,
      updated_at: f.updated_at,
      version: f.version,
    })),
    categories: categoriesWithPoints,
  });
});