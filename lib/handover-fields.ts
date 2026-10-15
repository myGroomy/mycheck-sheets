// lib/handover-fields.ts
// Resolusi field handover dari SNAPSHOT shift pembuatnya (bukan template
// shift yang sedang berjalan). Dipakai bersama oleh:
//   - GET /api/shifts/[id]/handover-prev  (handoeran shift sebelumnya)
//   - GET /api/handovers                   (riwayat handover)
//
// Kenapa harus dari snapshot: label field ikut menempel pada shift saat
// instance dibuka. Kalau UI mencocokkan id dengan template shift berjalan,
// handover lama akan salah label atau hilang begitu admin mengubah
// konfigurasi handover.

import { asStr } from './store';
import { formatReportValue } from './shared/report-values';
import type { Snapshot } from './db/snapshot';

export interface HandoverFieldView {
  id: string;
  label: string;
  fieldType: string;
  inputTypes: string[];
  value: unknown;
  /** Nilai siap tampil; '—' bila kosong. */
  display: string;
  hasPhoto: boolean;
}

/** Parse snapshot template; null bila rusak (jangan gagalkan seluruh respons). */
export function parseHandoverSnapshot(raw: unknown): Snapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(asStr(raw)) as Snapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Parse kolom `values`; objek kosong bila rusak. */
export function parseHandoverValues(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(asStr(raw) || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // nilai rusak -> dianggap kosong, bukan gagalkan respons
  }
  return {};
}

/** True bila nilai field handover memuat id foto. */
export function hasPhotoValue(value: unknown): boolean {
  if (!value) return false;
  // Bentuk tunggal: array id foto, mis. ['01J...', '01K...'].
  if (Array.isArray(value)) return value.some((item) => typeof item === 'string');
  // Bentuk jamak tipe: { foto: [...], teks: '...' }.
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      Array.isArray(item) ? item.some((x) => typeof x === 'string') : false
    );
  }
  return false;
}

/** Baca daftar id foto dari kolom `photo_ids` (array maupun JSON string). */
export function parsePhotoIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(asStr(raw) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Susun tampilan field dari snapshot shift pembuat + nilai tersimpan.
 *
 * Field yang masih ada di snapshot diurutkan mengikuti template. Nilai yang
 * field-nya sudah dihapus admin tetap ditampilkan (dengan penanda) supaya
 * isi lama tidak hilang diam-diam.
 */
export function resolveHandoverFields(
  snapshot: Snapshot | null,
  values: Record<string, unknown>,
): HandoverFieldView[] {
  const snapshotFields = Array.isArray(snapshot?.handover_fields)
    ? snapshot!.handover_fields
    : [];
  const knownIds = new Set(snapshotFields.map((f) => f.id));
  const extraIds = Object.keys(values).filter((id) => !knownIds.has(id));

  return [
    ...snapshotFields.map((field) => {
      const inputTypes = field.input_types?.length ? field.input_types : [field.field_type];
      const value = values[field.id];
      const onlyPhoto = inputTypes.length === 1 && inputTypes[0] === 'foto';
      return {
        id: field.id,
        label: field.label,
        fieldType: field.field_type,
        inputTypes,
        value,
        display: onlyPhoto
          ? `${Array.isArray(value) ? value.length : 0} foto terlampir`
          : (formatReportValue(value) || '—'),
        hasPhoto: hasPhotoValue(value),
      };
    }),
    ...extraIds.map((id) => {
      const value = values[id];
      return {
        id,
        label: `Field ${id} (sudah dihapus dari template)`,
        fieldType: 'teks',
        inputTypes: ['teks'],
        value,
        display: formatReportValue(value) || '—',
        hasPhoto: hasPhotoValue(value),
      };
    }),
  ];
}

/** Jumlah field yang benar-benar terisi (display != '—'). */
export function countFilledFields(fields: HandoverFieldView[]): number {
  return fields.filter((field) => field.display !== '—').length;
}

/** Tab bulanan instance: tab_month, fallback shift_date, fallback bulan ini. */
export function handoverTabMonth(row: Record<string, unknown>): string {
  const explicit = asStr(row['tab_month']).trim();
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
  const fromDate = asStr(row['shift_date']).trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(fromDate)) return fromDate;
  return new Date().toISOString().slice(0, 7);
}

/** Status instance yang handover-nya sudah final. */
export const CLOSED_SHIFT_STATUSES = ['ditutup', 'ditutup_paksa'] as const;

export function isClosedShiftStatus(status: string): boolean {
  return (CLOSED_SHIFT_STATUSES as readonly string[]).includes(status);
}
