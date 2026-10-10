// lib/db/snapshot.ts
// Build template snapshot versi Google Sheets, sesuai Template_cabang_mycheck.
import { createHash } from 'crypto';
import { asBool, asNum, asStr, filterRows, listRows } from '../store';

interface SnapshotPoint {
  point_ref: string;
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
}

export interface SnapshotCategory {
  id: string;
  name: string;
  sort_order: number;
  points: SnapshotPoint[];
}

export interface Snapshot {
  v: number;
  shift: { id: string; name: string; start_time: string; end_time: string; crosses_midnight: boolean };
  settings: { tolerance_default_minutes: number; timezone: string };
  categories: SnapshotCategory[];
  handover_fields: { id: string; label: string; field_type: string; options: string[] | null; is_required: boolean; sort_order: number }[];
}

/**
 * Hash snapshot template dipakai untuk mendeteksi perubahan template setelah
 * shift dibuka (BR-05: shift memakai snapshot saat dibuka).
 */
export function hashSnapshot(snapshot: Snapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export async function buildTemplateSnapshot(
  spreadsheetId: string,
  shiftDefinitionId: string,
  timezone: string
): Promise<Snapshot> {
  const defs = await filterRows(spreadsheetId, 'ShiftDefinitions', (r) => asStr(r['id']) === shiftDefinitionId);
  const shiftDef = defs[0];
  if (!shiftDef) throw new Error(`Shift definition ${shiftDefinitionId} tidak ditemukan`);

  const metaRows = await listRows(spreadsheetId, '_meta');
  const tolRow = metaRows.find((r) => asStr(r['key']) === 'tolerance_default_minutes');
  const toleranceDefault = tolRow ? parseInt(asStr(tolRow['value'])) || 15 : 15;

  const categories = (await filterRows(spreadsheetId, 'SopCategories', (r) =>
    asStr(r['shift_definition_id']) === shiftDefinitionId && asBool(r['is_active'])
  )).sort((a, b) => (asNum(a['sort_order']) ?? 0) - (asNum(b['sort_order']) ?? 0));

  const categoryIds = new Set(categories.map((c) => asStr(c['id'])));
  const points = (await filterRows(spreadsheetId, 'ChecklistPoints', (r) =>
    categoryIds.has(asStr(r['sop_category_id'])) && asBool(r['is_active'])
  )).sort((a, b) => (asNum(a['sort_order']) ?? 0) - (asNum(b['sort_order']) ?? 0));

  const handoverFieldsResult = (await filterRows(spreadsheetId, 'HandoverFields', (r) =>
    asStr(r['shift_definition_id']) === shiftDefinitionId && asBool(r['is_active'])
  )).sort((a, b) => (asNum(a['sort_order']) ?? 0) - (asNum(b['sort_order']) ?? 0));

  const snapshot: Snapshot = {
    v: 1,
    shift: {
      id: asStr(shiftDef['id']),
      name: asStr(shiftDef['name']),
      start_time: asStr(shiftDef['start_time']),
      end_time: asStr(shiftDef['end_time']),
      crosses_midnight: asBool(shiftDef['crosses_midnight']),
    },
    settings: { tolerance_default_minutes: toleranceDefault, timezone },
    categories: categories.map((cat) => ({
      id: asStr(cat['id']),
      name: asStr(cat['name']),
      sort_order: asNum(cat['sort_order']) ?? 0,
      points: points
        .filter((p) => asStr(p['sop_category_id']) === asStr(cat['id']))
        .map((p) => ({
          point_ref: asStr(p['id']),
          title: asStr(p['title']),
          instruction: p['instruction'] ? asStr(p['instruction']) : null,
          input_type: asStr(p['input_type']),
          is_required: asBool(p['is_required']),
          target_time: p['target_time'] ? asStr(p['target_time']) : null,
          tolerance_minutes: asNum(p['tolerance_minutes']),
          active_days: p['active_days'] ? asStr(p['active_days']) : null,
          number_min: asNum(p['number_min']),
          number_max: asNum(p['number_max']),
          sort_order: asNum(p['sort_order']) ?? 0,
        })),
    })),
    handover_fields: handoverFieldsResult.map((f) => ({
      id: asStr(f['id']),
      label: asStr(f['label']),
      field_type: asStr(f['field_type']),
      options: f['options'] ? (() => { try { const o = JSON.parse(asStr(f['options'])); return Array.isArray(o) ? o : null; } catch { return null; } })() : null,
      is_required: asBool(f['is_required']),
      sort_order: asNum(f['sort_order']) ?? 0,
    })),
  };

  return snapshot;
}
