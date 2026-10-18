import { deleteSheetRows } from './google/registry';
import { getDriveClient } from './google/client';
import { ensureSheet } from './google/sheets';
import { deterministicId } from './ids';
import { containsPhotoId } from './shared/report-values';
import {
  asStr,
  filterRows,
  getPeriodSheet,
  listMonthlyRowsFresh,
  listRowsWithNumberFresh,
  updateRow,
} from './store';

export const DRAFT_SHEET = 'Drafts';
export const DRAFT_HEADERS = [
  'id', 'shift_instance_id', 'user_id', 'shift_date', 'payload',
  'client_updated_at', 'created_at', 'updated_at', 'version',
] as const;

export function shiftDraftId(shiftInstanceId: string, userId: string): string {
  return deterministicId('DR', shiftInstanceId, userId);
}

export async function ensureDraftSheet(spreadsheetId: string) {
  await ensureSheet(spreadsheetId, DRAFT_SHEET, [...DRAFT_HEADERS]);
}

function photoIdsFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const points = (payload as { points?: unknown }).points;
  if (!points || typeof points !== 'object' || Array.isArray(points)) return [];
  const ids = new Set<string>();
  for (const point of Object.values(points as Record<string, unknown>)) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) continue;
    const photoIds = (point as { photoIds?: unknown }).photoIds;
    if (!Array.isArray(photoIds)) continue;
    for (const id of photoIds) if (typeof id === 'string' && id) ids.add(id);
  }
  return [...ids];
}

export async function purgeDraftPhotos(
  spreadsheetId: string,
  shiftInstanceId: string,
  shiftDate: string,
  userId: string,
  payload: unknown,
): Promise<void> {
  const photoIds = photoIdsFromPayload(payload);
  if (!photoIds.length) return;
  const photosSheet = await getPeriodSheet(spreadsheetId, 'Photos', shiftDate.slice(0, 7));
  let photoRows;
  try {
    photoRows = await listRowsWithNumberFresh(spreadsheetId, photosSheet);
  } catch {
    return;
  }
  let entries = [] as Record<string, unknown>[];
  try { entries = await listMonthlyRowsFresh(spreadsheetId, 'Entries', shiftDate.slice(0, 7)); } catch { /* optional */ }
  const entryPhotoIds = new Set(
    entries
      .filter((entry) => asStr(entry.shift_instance_id) === shiftInstanceId && asStr(entry.state) === 'selesai')
      .flatMap((entry) => photoIds.filter((id) => containsPhotoId(entry.value, id)))
  );
  const drive = getDriveClient();
  for (const row of photoRows) {
    const id = asStr(row.data.id);
    if (!photoIds.includes(id) || entryPhotoIds.has(id)) continue;
    if (asStr(row.data.shift_instance_id) !== shiftInstanceId) continue;
    if (asStr(row.data.uploaded_by) !== userId || asStr(row.data.status) !== 'uploaded') continue;
    await updateRow(spreadsheetId, photosSheet, row.rowNumber, {
      status: 'purged',
      purged_at: new Date().toISOString(),
    });
    const fileRef = asStr(row.data.file_ref);
    if (fileRef) {
      try { await drive.files.delete({ fileId: fileRef, supportsAllDrives: true }); } catch { /* best effort */ }
    }
  }
}

export async function cleanupClosedShiftDrafts(
  spreadsheetId: string,
  currentShiftInstanceId: string,
  currentShiftDate: string,
): Promise<string[]> {
  await ensureDraftSheet(spreadsheetId);
  const [draftRows, shiftRows] = await Promise.all([
    listRowsWithNumberFresh(spreadsheetId, DRAFT_SHEET),
    filterRows(spreadsheetId, 'ShiftInstances', (row) =>
      asStr(row.id) !== currentShiftInstanceId &&
      ['ditutup', 'ditutup_paksa', 'void'].includes(asStr(row.status)) &&
      asStr(row.shift_date) <= currentShiftDate
    ),
  ]);
  const closedIds = new Set(shiftRows.map((row) => asStr(row.id)));
  const targets = draftRows.filter((row) => closedIds.has(asStr(row.data.shift_instance_id)));
  for (const row of targets.sort((a, b) => b.rowNumber - a.rowNumber)) {
    try {
      const payload = JSON.parse(asStr(row.data.payload));
      await purgeDraftPhotos(
        spreadsheetId,
        asStr(row.data.shift_instance_id),
        asStr(row.data.shift_date),
        asStr(row.data.user_id),
        payload,
      );
    } catch { /* cleanup draft row must remain best-effort */ }
    await deleteSheetRows(spreadsheetId, DRAFT_SHEET, row.rowNumber);
  }
  return [...new Set(targets.map((row) => asStr(row.data.shift_instance_id)))];
}
