import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../../lib/api-auth';
import { resolveCabang } from '../../../../../../../lib/google/registry';
import { insertRow } from '../../../../../../../lib/store';
import { asNum, asStr } from '../../../../../../../lib/store';
import { ulid } from 'ulid';

/**
 * Salin template (shift definitions + kategori + points + handover fields)
 * dari spreadsheet cabang sumber ke spreadsheet cabang tujuan.
 *
 * Hanya sheet konfigurasi yang disalin — data operasional (shift instance,
 * entries, reports) tidak ikut.
 */
export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  // /api/admin/branches/[id]/copy-from/[source_id]
  // [..., 'branches', targetBranchId, 'copy-from', sourceBranchId]
  const sourceBranchId = pathParts[pathParts.length - 1];
  const targetBranchId = pathParts[pathParts.length - 3];

  if (targetBranchId === sourceBranchId) {
    return NextResponse.json(
      { error: 'Cabang sumber dan cabang tujuan tidak boleh sama' },
      { status: 400 }
    );
  }
  if (!ctx.branchIds.includes(targetBranchId) || !ctx.branchIds.includes(sourceBranchId)) {
    return NextResponse.json({ error: 'Akses ditolak untuk salah satu cabang.' }, { status: 403 });
  }

  let sourceSpreadsheetId = '';
  let targetSpreadsheetId = '';
  try {
    sourceSpreadsheetId = (await resolveCabang(sourceBranchId)).spreadsheetId;
  } catch {
    return NextResponse.json({ error: 'Cabang sumber tidak ditemukan' }, { status: 404 });
  }
  try {
    targetSpreadsheetId = (await resolveCabang(targetBranchId)).spreadsheetId;
  } catch {
    return NextResponse.json({ error: 'Cabang tujuan tidak ditemukan' }, { status: 404 });
  }

  const { filterRows, listRowsWithNumber } = await import('../../../../../../../lib/store');

  //where to write
  const targetDefs = await listRowsWithNumber(targetSpreadsheetId, 'ShiftDefinitions');
  if (targetDefs.length > 1) {
    return NextResponse.json(
      {
        error:
          'Cabang tujuan sudah memiliki definisi shift. Endpoint ini hanya untuk cabang kosong.',
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const copyTs = async (
    sheet: string,
    rows: Record<string, unknown>[],
    extra: (row: Record<string, unknown>) => Record<string, unknown> = () => ({})
  ) => {
    for (const row of rows) {
      // id / created_at / updated_at dibuat ulang di sheet tujuan
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
        rest[key] = value;
      }
      await insertRow(targetSpreadsheetId, sheet, {
        id: ulid(),
        ...rest,
        ...extra(row),
        created_at: now,
        updated_at: now,
      });
    }
  };

  const sourceDefs = await filterRows(sourceSpreadsheetId, 'ShiftDefinitions', () => true);
  for (const def of sourceDefs) {
    const newDefId = ulid();
    await insertRow(targetSpreadsheetId, 'ShiftDefinitions', {
      id: newDefId,
      name: asStr(def['name']),
      start_time: asStr(def['start_time']),
      end_time: asStr(def['end_time']),
      crosses_midnight: asStr(def['crosses_midnight']),
      sort_order: asNum(def['sort_order']) ?? 0,
      is_active: asStr(def['is_active']),
      created_at: now,
      updated_at: now,
      version: 1,
    });

    // Kategori + points
    const cats = await filterRows(
      sourceSpreadsheetId,
      'SopCategories',
      (r) => asStr(r['shift_definition_id']) === asStr(def['id'])
    );
    for (const cat of cats) {
      const newCatId = ulid();
      await insertRow(targetSpreadsheetId, 'SopCategories', {
        id: newCatId,
        shift_definition_id: newDefId,
        name: asStr(cat['name']),
        sort_order: asNum(cat['sort_order']) ?? 0,
        is_active: asStr(cat['is_active']),
        created_at: now,
        updated_at: now,
        version: 1,
      });

      const points = await filterRows(
        sourceSpreadsheetId,
        'ChecklistPoints',
        (r) => asStr(r['sop_category_id']) === asStr(cat['id'])
      );
      await copyTs('ChecklistPoints', points, () => ({ sop_category_id: newCatId }));
    }

    // Handover fields
    const fields = await filterRows(
      sourceSpreadsheetId,
      'HandoverFields',
      (r) => asStr(r['shift_definition_id']) === asStr(def['id'])
    );
    await copyTs('HandoverFields', fields, () => ({ shift_definition_id: newDefId }));
  }

  // Kategori incident (sheet statis per cabang, tanpa relasi shift)
  try {
    const sourceCats = await filterRows(sourceSpreadsheetId, 'IncidentCategories', () => true);
    const targetCats = await filterRows(targetSpreadsheetId, 'IncidentCategories', () => true).catch(
      () => [] as Record<string, unknown>[]
    );
    if (targetCats.length === 0) {
      await copyTs('IncidentCategories', sourceCats);
    }
  } catch {
    // sheet kategori belum ada di sumber — abaikan
  }

  return NextResponse.json({
    message: 'Template cabang berhasil disalin',
    copied: {
      shiftDefinitions: sourceDefs.length,
    },
  });
});