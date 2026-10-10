// lib/google/branch-schema.ts
// Skema sheet untuk spreadsheet per-cabang MIRROR dari Template_cabang_mycheck.
// Sheet statis (config) + sheet bulanan (transaksional, _YYYY-MM).

export const STATIC_SHEETS: Record<string, string[]> = {
  ShiftDefinitions: ['id', 'name', 'start_time', 'end_time', 'crosses_midnight', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  SopCategories: ['id', 'shift_definition_id', 'name', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  ChecklistPoints: ['id', 'sop_category_id', 'title', 'instruction', 'input_type', 'is_required', 'target_time', 'tolerance_minutes', 'active_days', 'number_min', 'number_max', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  HandoverFields: ['id', 'shift_definition_id', 'label', 'field_type', 'options', 'is_required', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  ShiftInstances: ['id', 'shift_definition_id', 'shift_date', 'tab_month', 'status', 'pj_user_id', 'opened_by', 'opened_at', 'opened_outside_hours', 'closed_at', 'closed_by', 'close_type', 'force_close_reason', 'is_incomplete', 'no_incident_confirmed', 'void_reason', 'void_by', 'void_at', 'is_test', 'snapshot_encoding', 'template_snapshot', 'snapshot_hash', 'created_at', 'updated_at', 'version'],
  Participants: ['id', 'shift_instance_id', 'user_id', 'first_action_at', 'first_action_type', 'created_at'],
  Reports: ['id', 'shift_instance_id', 'report_number', 'generated_by', 'generated_at', 'is_locked', 'summary_stats', 'content_hash', 'unlock_count', 'last_unlocked_at', 'last_unlocked_by', 'created_at', 'updated_at', 'version'],
  Addenda: ['id', 'report_id', 'author_id', 'note', 'created_at'],
  Summary: ['id', 'summary_date', 'shift_definition_id', 'shifts_total', 'shifts_closed_normal', 'shifts_closed_forced', 'shifts_void', 'required_total', 'required_done', 'required_skipped', 'timed_on_time', 'timed_early', 'timed_late', 'incidents_total', 'incidents_open', 'incidents_by_category', 'handovers_read', 'participants_count', 'computed_at'],
  Snapshots: ['id', 'shift_instance_id', 'part_no', 'chunk', 'created_at'],
  IncidentIndex: ['incident_id', 'tab_month', 'status', 'category_id', 'shift_instance_id', 'outside_shift', 'reported_at', 'is_test', 'updated_at'],
  IncidentCategories: ['id', 'name', 'sort_order', 'is_active', 'created_at', 'updated_at'],
  Notifications: ['id', 'user_id', 'type', 'title', 'body', 'link', 'is_read', 'created_at'],
  _meta: ['key', 'value'],
};

export const MONTHLY_SHEETS: Record<string, string[]> = {
  Entries: ['id', 'shift_instance_id', 'point_ref', 'state', 'value', 'out_of_range', 'photo_ids', 'completed_by', 'completed_at', 'timing_label', 'timing_delta_minutes', 'skip_reason', 'created_at', 'updated_at', 'version'],
  EntryLogs: ['id', 'shift_instance_id', 'entry_id', 'point_ref', 'action', 'outcome', 'user_id', 'winner_user_id', 'prev_state', 'new_state', 'value', 'note', 'client_action_id', 'client_at', 'at', 'created_at'],
  Handovers: ['id', 'shift_instance_id', 'values', 'free_text', 'photo_ids', 'submitted_by', 'submitted_at', 'created_at', 'updated_at'],
  HandoverAcks: ['id', 'handover_id', 'reading_shift_instance_id', 'user_id', 'read_at', 'created_at'],
  Incidents: ['id', 'shift_instance_id', 'tab_month', 'category_id', 'description', 'occurred_at', 'reported_by', 'reported_at', 'status', 'outside_shift', 'link_source', 'linked_by', 'linked_at', 'source_entry_id', 'severity', 'status_changed_by', 'status_changed_at', 'is_test', 'created_at', 'updated_at', 'version'],
  IncidentNotes: ['id', 'incident_id', 'author_id', 'author_role', 'note', 'created_at'],
  Photos: ['id', 'shift_instance_id', 'owner_type', 'owner_id', 'storage', 'file_ref', 'mime', 'size_bytes', 'width', 'height', 'sort_order', 'status', 'uploaded_by', 'uploaded_at', 'purged_at', 'created_at'],
  AuditLog: ['id', 'seq', 'at', 'actor_id', 'action', 'object_type', 'object_id', 'branch_id', 'shift_instance_id', 'before', 'after', 'reason', 'prev_hash', 'hash'],
};

export const BRANCH_SHEETS: Record<string, string[]> = { ...STATIC_SHEETS, ...MONTHLY_SHEETS };

/** Nama sheet bulanan: Entries_2026-10 */
export function monthlySheet(base: string, tabMonth: string): string {
  return `${base}_${tabMonth}`;
}

/** Parse tabMonth dari nama sheet (Entries_2026-10 -> 2026-10); null bila bukan sheet bulanan */
export function parseTabMonth(sheetName: string): string | null {
  const m = sheetName.match(/_(\d{4}-\d{2})$/);
  return m ? m[1] : null;
}

/** Header dari nama sheet (statis atau bulanan) */
export function getHeaders(sheetName: string): string[] {
  if (BRANCH_SHEETS[sheetName]) return BRANCH_SHEETS[sheetName];
  const base = sheetName.replace(/_\d{4}-\d{2}$/, '');
  if (MONTHLY_SHEETS[base]) return MONTHLY_SHEETS[base];
  throw new Error('Unknown sheet: ' + sheetName);
}

/** Bangun baris nilai sesuai urutan header */
export function rowFromObject(sheetName: string, obj: Record<string, unknown>): unknown[] {
  const headers = getHeaders(sheetName);
  return headers.map((h) => {
    const v = obj[h];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}
