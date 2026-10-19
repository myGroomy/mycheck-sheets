// Fase 18: histori pergantian PJ (sheet ShiftPjAssignments) — bahan rasio waktu scoring.
import { ulid } from 'ulid';
import { asBool, asStr, insertRow, listRowsWithNumberFresh, updateRow } from './store';
import { getServerTime } from './db/server-time';

/** Catat PJ aktif baru. `source`: 'open' (shift dibuka) atau 'change_pj'. */
export async function recordPjAssignment(
  spreadsheetId: string,
  shiftInstanceId: string,
  userId: string,
  source: 'open' | 'change_pj'
): Promise<void> {
  const now = getServerTime().toISOString();
  await insertRow(spreadsheetId, 'ShiftPjAssignments', {
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    user_id: userId,
    started_at: now,
    ended_at: '',
    is_current: true,
    source,
    created_at: now,
  });
}

/** Tutup semua assignment aktif shift ini sebelum pergantian ke PJ baru. */
export async function endActivePjAssignments(spreadsheetId: string, shiftInstanceId: string): Promise<void> {
  const now = getServerTime().toISOString();
  const rows = await listRowsWithNumberFresh(spreadsheetId, 'ShiftPjAssignments');
  for (const { rowNumber, data } of rows) {
    if (
      asStr(data['shift_instance_id']) === shiftInstanceId &&
      asBool(data['is_current'])
    ) {
      await updateRow(spreadsheetId, 'ShiftPjAssignments', rowNumber, {
        ended_at: now,
        is_current: false,
      });
    }
  }
}
