// Sumber kebenaran skema spreadsheet cabang.

export const STATIC_SHEETS: Record<string, string[]> = {
  ShiftDefinitions: ['id', 'name', 'start_time', 'end_time', 'crosses_midnight', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  SopCategories: ['id', 'shift_definition_id', 'name', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  ChecklistPoints: ['id', 'sop_category_id', 'title', 'instruction', 'input_type', 'input_types', 'options', 'is_required', 'target_time', 'tolerance_minutes', 'active_days', 'number_min', 'number_max', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  HandoverFields: ['id', 'shift_definition_id', 'label', 'field_type', 'input_types', 'options', 'is_required', 'sort_order', 'is_active', 'created_at', 'updated_at', 'version'],
  ShiftInstances: ['id', 'shift_definition_id', 'shift_date', 'tab_month', 'status', 'pj_user_id', 'opened_by', 'opened_at', 'opened_outside_hours', 'closed_at', 'closed_by', 'close_type', 'force_close_reason', 'is_incomplete', 'no_incident_confirmed', 'void_reason', 'void_by', 'void_at', 'is_test', 'snapshot_encoding', 'template_snapshot', 'snapshot_hash', 'created_at', 'updated_at', 'version', 'tab_year'],
  Participants: ['id', 'shift_instance_id', 'user_id', 'first_action_at', 'first_action_type', 'created_at'],
  Reports: ['id', 'shift_instance_id', 'report_number', 'generated_by', 'generated_at', 'is_locked', 'summary_stats', 'content_hash', 'unlock_count', 'last_unlocked_at', 'last_unlocked_by', 'created_at', 'updated_at', 'version'],
  Addenda: ['id', 'report_id', 'author_id', 'note', 'created_at'],
  Summary: ['id', 'summary_date', 'shift_definition_id', 'shifts_total', 'shifts_closed_normal', 'shifts_closed_forced', 'shifts_void', 'required_total', 'required_done', 'required_skipped', 'timed_on_time', 'timed_early', 'timed_late', 'incidents_total', 'incidents_open', 'incidents_by_category', 'handovers_read', 'participants_count', 'computed_at'],
  Snapshots: ['id', 'shift_instance_id', 'part_no', 'chunk', 'created_at'],
  IncidentIndex: ['incident_id', 'tab_month', 'status', 'category_id', 'shift_instance_id', 'outside_shift', 'reported_at', 'is_test', 'updated_at'],
  IncidentCategories: ['id', 'name', 'sort_order', 'is_active', 'created_at', 'updated_at', 'points'],
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
  Photos: ['id', 'shift_instance_id', 'owner_type', 'owner_id', 'storage', 'file_ref', 'mime', 'size_bytes', 'width', 'height', 'sort_order', 'status', 'uploaded_by', 'uploaded_at', 'purged_at', 'created_at', 'sha256'],
  AuditLog: ['id', 'seq', 'at', 'actor_id', 'action', 'object_type', 'object_id', 'branch_id', 'shift_instance_id', 'before', 'after', 'reason', 'prev_hash', 'hash'],
};

export const YEARLY_SHEETS: Record<string, string[]> = Object.fromEntries(
  Object.entries(MONTHLY_SHEETS).map(([base, headers]) => [base, [...headers]])
);
YEARLY_SHEETS.Incidents = [...YEARLY_SHEETS.Incidents, 'points_snapshot'];

export const BRANCH_SHEETS: Record<string, string[]> = { ...STATIC_SHEETS, ...MONTHLY_SHEETS };
export type PeriodMode = 'monthly' | 'yearly' | 'flat';

export function periodSheetName(base: string, period: string, mode: PeriodMode = 'monthly'): string {
  if (mode === 'flat') return base;
  const normalized = mode === 'yearly' ? period.slice(0, 4) : period.slice(0, 7);
  return `${base}_${normalized}`;
}

export function monthlySheet(base: string, tabMonth: string): string {
  return periodSheetName(base, tabMonth, 'monthly');
}

export function yearlySheet(base: string, tabYear: string): string {
  return periodSheetName(base, tabYear, 'yearly');
}

export function parseTabMonth(sheetName: string): string | null {
  const match = sheetName.match(/_(\d{4}-\d{2})$/);
  return match ? match[1] : null;
}

export function parseTabYear(sheetName: string): string | null {
  const match = sheetName.match(/_(\d{4})$/);
  return match ? match[1] : null;
}

export function getHeaders(sheetName: string): string[] {
  if (BRANCH_SHEETS[sheetName]) return BRANCH_SHEETS[sheetName];
  const base = sheetName.replace(/_\d{4}(?:-\d{2})?$/, '');
  if (/^.+_\d{4}$/.test(sheetName) && YEARLY_SHEETS[base]) return YEARLY_SHEETS[base];
  if (MONTHLY_SHEETS[base]) return MONTHLY_SHEETS[base];
  throw new Error(`Unknown sheet: ${sheetName}`);
}

export function rowFromObject(sheetName: string, obj: Record<string, unknown>): unknown[] {
  return getHeaders(sheetName).map((header) => {
    const value = obj[header];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  });
}
