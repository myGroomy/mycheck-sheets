import { incidentStatusSchema, severitySchema, shiftStatusSchema } from '../shared';

export function validateEnum(field: string, value: unknown): void {
  const result = field === 'severity'
    ? severitySchema.safeParse(value)
    : field === 'status'
      ? incidentStatusSchema.or(shiftStatusSchema).safeParse(value)
      : { success: true };
  if (!result.success) throw new Error(`Nilai ${field} tidak valid: ${String(value)}`);
}

export function validateRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const field of ['severity', 'status']) if (row[field] !== undefined && row[field] !== '') validateEnum(field, row[field]);
  return row;
}
