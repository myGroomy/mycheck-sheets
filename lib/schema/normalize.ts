import { asBool, asNum } from '../store';

const BOOLEAN_FIELDS = new Set(['is_active', 'is_test', 'outside_shift', 'is_required', 'is_locked', 'is_read', 'out_of_range', 'crosses_midnight', 'opened_outside_hours', 'is_incomplete', 'no_incident_confirmed']);
const INTEGER_FIELDS = new Set(['sort_order', 'version', 'tolerance_minutes', 'number_min', 'number_max', 'shifts_total', 'points', 'points_snapshot', 'size_bytes', 'width', 'height', 'seq', 'timing_delta_minutes', 'unlock_count', 'part_no']);

export function normalizeRead(row: Record<string, unknown>): Record<string, unknown> {
  const result = { ...row };
  for (const field of BOOLEAN_FIELDS) if (field in result && result[field] !== '') result[field] = asBool(result[field]);
  for (const field of INTEGER_FIELDS) {
    if (!(field in result) || result[field] === '') continue;
    const value = asNum(result[field]);
    if (value !== null) result[field] = Math.trunc(value);
  }
  if (typeof result.severity === 'string') result.severity = ({ low: 'rendah', medium: 'sedang', high: 'tinggi' } as Record<string, string>)[result.severity] ?? result.severity;
  return result;
}

export function normalizeWrite(row: Record<string, unknown>): Record<string, unknown> {
  const result = { ...row };
  for (const field of BOOLEAN_FIELDS) if (field in result && result[field] !== '') result[field] = asBool(result[field]);
  for (const field of INTEGER_FIELDS) {
    if (!(field in result) || result[field] === '') continue;
    const value = asNum(result[field]);
    if (value !== null) result[field] = Math.trunc(value);
  }
  if (result.severity !== undefined) result.severity = ({ low: 'rendah', medium: 'sedang', high: 'tinggi' } as Record<string, string>)[String(result.severity)] ?? result.severity;
  return result;
}
