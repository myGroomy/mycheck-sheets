// lib/admin/template-service.ts
// CRUD template cabang (ShiftDefinitions, SopCategories, ChecklistPoints,
// HandoverFields) pada spreadsheet cabang. Semua kolom snake_case.
//
// Catatan penting: sheet config di spreadsheet cabang bersifat "flat" ID
// shift definition menjadi penanda cabang secara implisit, jadi tidak ada
// kolom branch_id (cabang = spreadsheet).

import { ulid } from 'ulid';
import {
  filterRows,
  findRowFresh,
  findRow,
  insertRow,
  listRows,
  listRowsFresh,
  updateRow,
} from '../store';
import { deleteSheetRows } from '../google/registry';
import { getSheetsClient } from '../google/client';
import { asBool, asNum, asStr } from '../store';
import { normalizeInputTypes } from '../shared';
import { normalizeSectionColor } from '../shared/section-color';

export interface ShiftDefinition {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SopCategory {
  id: string;
  shift_definition_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
  /** Hex warna section (Fase 16); kosong = default grayscale. */
  color?: string | null;
}

export interface ChecklistPoint {
  id: string;
  sop_category_id: string;
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
  points: number;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface HandoverField {
  id: string;
  shift_definition_id: string;
  label: string;
  field_type: string;
  input_types: string[];
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

const nowIso = () => new Date().toISOString();

/** Pecah kolom `options` (JSON array) menjadi string[] | null. */
function parseOptions(v: unknown): string[] | null {
  const raw = asStr(v);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return Array.isArray(o) ? o.map(String) : null;
  } catch {
    return null;
  }
}

/** Jumlah anak (kategori/point/field) milik shift definition. */
async function childCount(
  spreadsheetId: string,
  sheet: string,
  shiftDefinitionId: string,
  fresh = false
): Promise<number> {
  const rows = fresh
    ? await listRowsFresh(spreadsheetId, sheet)
    : await filterRows(spreadsheetId, sheet, () => true);
  return rows.filter((row) => asStr(row['shift_definition_id']) === shiftDefinitionId).length;
}

// ============================================
// Shift Definitions
// ============================================

export async function listShiftDefinitions(
  spreadsheetId: string,
  fresh = false
): Promise<ShiftDefinition[]> {
  const rows = fresh
    ? await listRowsFresh(spreadsheetId, 'ShiftDefinitions')
    : await filterRows(spreadsheetId, 'ShiftDefinitions', () => true);
  return rows
    .map((r) => ({
      id: asStr(r['id']),
      name: asStr(r['name']),
      start_time: asStr(r['start_time']),
      end_time: asStr(r['end_time']),
      crosses_midnight: asBool(r['crosses_midnight']),
      sort_order: asNum(r['sort_order']) ?? 0,
      is_active: asBool(r['is_active']),
      created_at: asStr(r['created_at']),
      updated_at: asStr(r['updated_at']),
      version: asNum(r['version']) ?? 1,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function getShiftDefinition(
  spreadsheetId: string,
  id: string,
  fresh = false
): Promise<ShiftDefinition | null> {
  const list = await listShiftDefinitions(spreadsheetId, fresh);
  return list.find((s) => s.id === id) ?? null;
}

export async function createShiftDefinition(
  spreadsheetId: string,
  input: {
    name: string;
    start_time: string;
    end_time: string;
    crosses_midnight?: boolean;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<ShiftDefinition> {
  const row = {
    id: ulid(),
    name: input.name,
    start_time: input.start_time,
    end_time: input.end_time,
    crosses_midnight: input.crosses_midnight ?? false,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
    created_at: nowIso(),
    updated_at: nowIso(),
    version: 1,
  };
  await insertRow(spreadsheetId, 'ShiftDefinitions', row);
  return row as ShiftDefinition;
}

export async function updateShiftDefinition(
  spreadsheetId: string,
  id: string,
  updates: Partial<Omit<ShiftDefinition, 'id' | 'created_at'>>
): Promise<void> {
  const found = await findRow(spreadsheetId, 'ShiftDefinitions', 'id', id);
  if (!found) throw new Error('SHIFT_DEFINITION_TIDAK_DITEMUKAN');
  const patch: Record<string, unknown> = { ...updates, updated_at: nowIso() };
  if (patch['version'] !== undefined) {
    patch['version'] = (asNum(found.data['version']) ?? 1) + 1;
  }
  await updateRow(spreadsheetId, 'ShiftDefinitions', found.rowNumber, patch);
}

export async function deleteShiftDefinition(
  spreadsheetId: string,
  id: string
): Promise<void> {
  const found = await findRowFresh(spreadsheetId, 'ShiftDefinitions', 'id', id);
  if (!found) throw new Error('SHIFT_DEFINITION_TIDAK_DITEMUKAN');
  await deleteSheetRows(spreadsheetId, 'ShiftDefinitions', found.rowNumber);
}

/** Duplikasi shift definition beserta seluruh kategoris, points, dan handover fields. */
export async function duplicateShiftDefinition(
  spreadsheetId: string,
  sourceId: string
): Promise<ShiftDefinition> {
  const source = await getShiftDefinition(spreadsheetId, sourceId);
  if (!source) throw new Error('SHIFT_DEFINITION_TIDAK_DITEMUKAN');

  const copy = await createShiftDefinition(spreadsheetId, {
    ...source,
    name: `${source.name} (copy)`,
  });

  const categories = await listSopCategories(spreadsheetId, sourceId);
  for (const cat of categories) {
    const newCat = await createSopCategory(spreadsheetId, {
      shift_definition_id: copy.id,
      name: cat.name,
      sort_order: cat.sort_order,
      is_active: cat.is_active,
    });
    const points = await listChecklistPoints(spreadsheetId, cat.id);
    for (const p of points) {
      await createChecklistPoint(spreadsheetId, {
        ...p,
        sop_category_id: newCat.id,
      });
    }
  }

  const fields = await listHandoverFields(spreadsheetId, sourceId);
  for (const f of fields) {
    await createHandoverField(spreadsheetId, {
      shift_definition_id: copy.id,
      label: f.label,
      field_type: f.field_type,
      input_types: f.input_types,
      options: f.options,
      is_required: f.is_required,
      sort_order: f.sort_order,
      is_active: f.is_active,
    });
  }

  return copy;
}

/** Hitung instance yang memakai shift definition ini (blokir hapus bila dipakai). */
export async function shiftInstanceCount(
  spreadsheetId: string,
  shiftDefinitionId: string,
  fresh = false
): Promise<number> {
  const rows = fresh
    ? await listRowsFresh(spreadsheetId, 'ShiftInstances')
    : await filterRows(spreadsheetId, 'ShiftInstances', () => true);
  return rows.filter((row) => asStr(row['shift_definition_id']) === shiftDefinitionId).length;
}

// ============================================
// SOP Categories
// ============================================

export async function listSopCategories(
  spreadsheetId: string,
  shiftDefinitionId: string,
  fresh = false
): Promise<SopCategory[]> {
  const allRows = fresh
    ? await listRowsFresh(spreadsheetId, 'SopCategories')
    : await filterRows(spreadsheetId, 'SopCategories', () => true);
  const rows = allRows.filter((row) => asStr(row['shift_definition_id']) === shiftDefinitionId);
  return rows
    .map((r) => ({
      id: asStr(r['id']),
      shift_definition_id: asStr(r['shift_definition_id']),
      name: asStr(r['name']),
      sort_order: asNum(r['sort_order']) ?? 0,
      is_active: asBool(r['is_active']),
      created_at: asStr(r['created_at']),
      updated_at: asStr(r['updated_at']),
      version: asNum(r['version']) ?? 1,
      color: normalizeSectionColor(r['color']),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function createSopCategory(
  spreadsheetId: string,
  input: {
    shift_definition_id: string;
    name: string;
    sort_order?: number;
    is_active?: boolean;
    color?: string | null;
  }
): Promise<SopCategory> {
  const row = {
    id: ulid(),
    shift_definition_id: input.shift_definition_id,
    name: input.name,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
    color: normalizeSectionColor(input.color),
    created_at: nowIso(),
    updated_at: nowIso(),
    version: 1,
  };
  await insertRow(spreadsheetId, 'SopCategories', row);
  return row as SopCategory;
}

export async function updateSopCategory(
  spreadsheetId: string,
  id: string,
  updates: Partial<Omit<SopCategory, 'id' | 'created_at' | 'shift_definition_id'>>
): Promise<void> {
  const found = await findRow(spreadsheetId, 'SopCategories', 'id', id);
  if (!found) throw new Error('SOP_CATEGORY_TIDAK_DITEMUKAN');
  await updateRow(spreadsheetId, 'SopCategories', found.rowNumber, {
    ...updates,
    updated_at: nowIso(),
    version: (asNum(found.data['version']) ?? 1) + 1,
  });
}

export async function deleteSopCategory(spreadsheetId: string, id: string): Promise<void> {
  const found = await findRowFresh(spreadsheetId, 'SopCategories', 'id', id);
  if (!found) throw new Error('SOP_CATEGORY_TIDAK_DITEMUKAN');
  await deleteSheetRows(spreadsheetId, 'SopCategories', found.rowNumber);
}

/** Duplikasi kategori beserta points-nya. */
export async function duplicateSopCategory(
  spreadsheetId: string,
  sourceId: string
): Promise<SopCategory> {
  const rows = await filterRows(spreadsheetId, 'SopCategories', (r) => asStr(r['id']) === sourceId);
  const source = rows[0];
  if (!source) throw new Error('SOP_CATEGORY_TIDAK_DITEMUKAN');

  const copy = await createSopCategory(spreadsheetId, {
    shift_definition_id: asStr(source['shift_definition_id']),
    name: `${asStr(source['name'])} (copy)`,
    sort_order: asNum(source['sort_order']) ?? 0,
    is_active: asBool(source['is_active']),
  });

  const points = await listChecklistPoints(spreadsheetId, sourceId);
  for (const p of points) {
    await createChecklistPoint(spreadsheetId, { ...p, sop_category_id: copy.id });
  }
  return copy;
}

// ============================================
// Checklist Points
// ============================================

export async function listChecklistPoints(
  spreadsheetId: string,
  sopCategoryId: string,
  fresh = false
): Promise<ChecklistPoint[]> {
  const allRows = fresh
    ? await listRowsFresh(spreadsheetId, 'ChecklistPoints')
    : await filterRows(spreadsheetId, 'ChecklistPoints', () => true);
  const rows = allRows.filter((row) => asStr(row['sop_category_id']) === sopCategoryId);
  return rows
    .map((r) => ({
      id: asStr(r['id']),
      sop_category_id: asStr(r['sop_category_id']),
      title: asStr(r['title']),
      instruction: asStr(r['instruction']) || null,
      input_type: asStr(r['input_type']),
      input_types: normalizeInputTypes(r['input_types'], asStr(r['input_type'])),
      options: parseOptions(r['options']),
      is_required: asBool(r['is_required']),
      target_time: asStr(r['target_time']) || null,
      tolerance_minutes: asNum(r['tolerance_minutes']),
      active_days: asStr(r['active_days']) || null,
      number_min: asNum(r['number_min']),
      number_max: asNum(r['number_max']),
      sort_order: asNum(r['sort_order']) ?? 0,
      is_active: asBool(r['is_active']),
      points: Math.max(0, asNum(r['points']) ?? 1),
      created_at: asStr(r['created_at']),
      updated_at: asStr(r['updated_at']),
      version: asNum(r['version']) ?? 1,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function createChecklistPoint(
  spreadsheetId: string,
  input: Omit<ChecklistPoint, 'id' | 'created_at' | 'updated_at' | 'version'> &
    Partial<Pick<ChecklistPoint, 'version'>>
): Promise<ChecklistPoint> {
  const row = {
    ...input,
    id: ulid(),
    created_at: nowIso(),
    updated_at: nowIso(),
    version: input.version ?? 1,
  };
  await insertRow(spreadsheetId, 'ChecklistPoints', row);
  return row as ChecklistPoint;
}

export async function updateChecklistPoint(
  spreadsheetId: string,
  id: string,
  updates: Partial<Omit<ChecklistPoint, 'id' | 'created_at' | 'sop_category_id'>>
): Promise<void> {
  const found = await findRow(spreadsheetId, 'ChecklistPoints', 'id', id);
  if (!found) throw new Error('CHECKLIST_POINT_TIDAK_DITEMUKAN');
  await updateRow(spreadsheetId, 'ChecklistPoints', found.rowNumber, {
    ...updates,
    updated_at: nowIso(),
    version: (asNum(found.data['version']) ?? 1) + 1,
  });
}

export async function deleteChecklistPoint(spreadsheetId: string, id: string): Promise<void> {
  const found = await findRowFresh(spreadsheetId, 'ChecklistPoints', 'id', id);
  if (!found) throw new Error('CHECKLIST_POINT_TIDAK_DITEMUKAN');
  await deleteSheetRows(spreadsheetId, 'ChecklistPoints', found.rowNumber);
}

/** Daftar point_ref yang masih dirujuk oleh semua tab historis. */
export async function listChecklistPointRefsInUse(
  spreadsheetId: string,
  fresh = false
): Promise<Set<string>> {
  const metadata = await getSheetsClient().spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const historySheets = (metadata.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? '')
    .filter((title) => /^(Entries|EntryLogs)_\d{4}-\d{2}$/.test(title));
  const used = new Set<string>();

  for (let offset = 0; offset < historySheets.length; offset += 4) {
    const batch = historySheets.slice(offset, offset + 4);
    const rowsBySheet = await Promise.all(
      batch.map((sheet) =>
        fresh ? listRowsFresh(spreadsheetId, sheet) : listRows(spreadsheetId, sheet)
      )
    );
    for (const rows of rowsBySheet) {
      for (const row of rows) {
        const pointRef = asStr(row['point_ref']);
        if (pointRef) used.add(pointRef);
      }
    }
  }
  return used;
}

/** Cari referensi point pada semua bulan agar data lama/orphan tetap dilindungi. */
export async function checklistPointHasEntryHistory(
  spreadsheetId: string,
  pointId: string
): Promise<boolean> {
  return (await listChecklistPointRefsInUse(spreadsheetId, true)).has(pointId);
}


export async function duplicateChecklistPoint(
  spreadsheetId: string,
  sourceId: string
): Promise<ChecklistPoint> {
  const rows = await filterRows(spreadsheetId, 'ChecklistPoints', (r) => asStr(r['id']) === sourceId);
  const source = rows[0];
  if (!source) throw new Error('CHECKLIST_POINT_TIDAK_DITEMUKAN');
  return createChecklistPoint(spreadsheetId, {
    sop_category_id: asStr(source['sop_category_id']),
    title: `${asStr(source['title'])} (copy)`,
    instruction: asStr(source['instruction']) || null,
    input_type: asStr(source['input_type']),
    input_types: normalizeInputTypes(source['input_types'], asStr(source['input_type'])),
    options: parseOptions(source['options']),
    is_required: asBool(source['is_required']),
    target_time: asStr(source['target_time']) || null,
    tolerance_minutes: asNum(source['tolerance_minutes']),
    points: Math.max(0, asNum(source['points']) ?? 1),
    active_days: asStr(source['active_days']) || null,
    number_min: asNum(source['number_min']),
    number_max: asNum(source['number_max']),
    sort_order: asNum(source['sort_order']) ?? 0,
    is_active: asBool(source['is_active']),
  });
}

export interface IncidentCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  points: number;
  penalty_min_severity: string;
  created_at: string;
  updated_at: string;
}

function toIncidentCategory(r: Record<string, unknown>): IncidentCategory {
  return {
    id: asStr(r['id']),
    name: asStr(r['name']),
    sort_order: asNum(r['sort_order']) ?? 0,
    is_active: asBool(r['is_active']),
    points: Math.max(0, asNum(r['points']) ?? 0),
    penalty_min_severity: asStr(r['penalty_min_severity']) || 'none',
    created_at: asStr(r['created_at']),
    updated_at: asStr(r['updated_at']),
  };
}

/** Daftar kategori incident pada satu cabang (termasuk nonaktif untuk admin). */
export async function listIncidentCategories(spreadsheetId: string): Promise<IncidentCategory[]> {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = await filterRows(spreadsheetId, 'IncidentCategories', () => true);
  } catch {
    return [];
  }
  return rows.map(toIncidentCategory).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getIncidentCategory(
  spreadsheetId: string,
  id: string,
  fresh = false
): Promise<IncidentCategory | null> {
  const found = await (fresh
    ? findRowFresh(spreadsheetId, 'IncidentCategories', 'id', id)
    : findRow(spreadsheetId, 'IncidentCategories', 'id', id)
  ).catch(() => null);
  return found ? toIncidentCategory(found.data) : null;
}

export async function createIncidentCategory(
  spreadsheetId: string,
  input: { name: string; sort_order?: number; is_active?: boolean; points?: number; penalty_min_severity?: string }
): Promise<IncidentCategory> {
  const row = {
    id: ulid(),
    name: input.name,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
    points: Math.max(0, Math.trunc(input.points ?? 0)),
    penalty_min_severity: input.penalty_min_severity ?? 'none',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await insertRow(spreadsheetId, 'IncidentCategories', row);
  return row as IncidentCategory;
}

export async function updateIncidentCategory(
  spreadsheetId: string,
  id: string,
  updates: Partial<Omit<IncidentCategory, 'id' | 'created_at'>>
): Promise<void> {
  const found = await findRow(spreadsheetId, 'IncidentCategories', 'id', id);
  if (!found) throw new Error('INCIDENT_CATEGORY_TIDAK_DITEMUKAN');
  await updateRow(spreadsheetId, 'IncidentCategories', found.rowNumber, {
    ...updates,
    updated_at: nowIso(),
  });
}

export async function deleteIncidentCategory(spreadsheetId: string, id: string): Promise<void> {
  const found = await findRowFresh(spreadsheetId, 'IncidentCategories', 'id', id);
  if (!found) throw new Error('INCIDENT_CATEGORY_TIDAK_DITEMUKAN');
  await deleteSheetRows(spreadsheetId, 'IncidentCategories', found.rowNumber);
}

// ============================================
// Handover Fields
// ============================================

export async function listHandoverFields(
  spreadsheetId: string,
  shiftDefinitionId: string,
  fresh = false
): Promise<HandoverField[]> {
  const allRows = fresh
    ? await listRowsFresh(spreadsheetId, 'HandoverFields')
    : await filterRows(spreadsheetId, 'HandoverFields', () => true);
  const rows = allRows.filter((row) => asStr(row['shift_definition_id']) === shiftDefinitionId);
  return rows
    .map((r) => ({
      id: asStr(r['id']),
      shift_definition_id: asStr(r['shift_definition_id']),
      label: asStr(r['label']),
      field_type: asStr(r['field_type']),
      input_types: normalizeInputTypes(r['input_types'], asStr(r['field_type'])),
      options: parseOptions(r['options']),
      is_required: asBool(r['is_required']),
      sort_order: asNum(r['sort_order']) ?? 0,
      is_active: asBool(r['is_active']),
      created_at: asStr(r['created_at']),
      updated_at: asStr(r['updated_at']),
      version: asNum(r['version']) ?? 1,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function createHandoverField(
  spreadsheetId: string,
  input: {
    shift_definition_id: string;
    label: string;
    field_type: string;
    input_types?: string[] | null;
    options?: string[] | null;
    is_required?: boolean;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<HandoverField> {
  const row = {
    id: ulid(),
    shift_definition_id: input.shift_definition_id,
    label: input.label,
    field_type: input.field_type,
    input_types: input.input_types?.length ? input.input_types : [input.field_type],
    options: input.options && input.options.length > 0 ? input.options : null,
    is_required: input.is_required ?? false,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
    created_at: nowIso(),
    updated_at: nowIso(),
    version: 1,
  };
  await insertRow(spreadsheetId, 'HandoverFields', row);
  return {
    ...row,
    input_types: input.input_types?.length ? input.input_types : [input.field_type],
    options: input.options ?? null,
  } as HandoverField;
}

export async function updateHandoverField(
  spreadsheetId: string,
  id: string,
  updates: Partial<Omit<HandoverField, 'id' | 'created_at' | 'shift_definition_id'>>
): Promise<void> {
  const found = await findRow(spreadsheetId, 'HandoverFields', 'id', id);
  if (!found) throw new Error('HANDOVER_FIELD_TIDAK_DITEMUKAN');
  const patch: Record<string, unknown> = { ...updates, updated_at: nowIso() };
  if (Array.isArray(patch['options'])) {
    patch['options'] = (patch['options'] as string[]).length > 0 ? patch['options'] : null;
  }
  await updateRow(spreadsheetId, 'HandoverFields', found.rowNumber, {
    ...patch,
    version: (asNum(found.data['version']) ?? 1) + 1,
  });
}

export async function deleteHandoverField(spreadsheetId: string, id: string): Promise<void> {
  const found = await findRowFresh(spreadsheetId, 'HandoverFields', 'id', id);
  if (!found) throw new Error('HANDOVER_FIELD_TIDAK_DITEMUKAN');
  await deleteSheetRows(spreadsheetId, 'HandoverFields', found.rowNumber);
}

/** Jumlah anak untuk pesan validasi hapus. */
export async function templateChildCounts(
  spreadsheetId: string,
  shiftDefinitionId: string,
  fresh = false
): Promise<{ categories: number; handover_fields: number }> {
  return {
    categories: await childCount(spreadsheetId, 'SopCategories', shiftDefinitionId, fresh),
    handover_fields: await childCount(spreadsheetId, 'HandoverFields', shiftDefinitionId, fresh),
  };
}
