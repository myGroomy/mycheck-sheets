import type { ShiftDraftPayload } from './draft-types';
import { acquireLock, deleteKeys, getJson, isUpstashConfigured, releaseLock, scanKeys, setJson } from './redis/upstash';
import { ulid } from 'ulid';
import {
  ensureMonthlySheet,
  insertRows,
  listRowsWithNumber,
  updateRows,
} from './store';

const BUFFER_VERSION = 'v1';
const ACTIVE_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 10;

export type BufferedDraftRecord = ShiftDraftPayload & {
  id: string;
  createdAt: string;
  serverUpdatedAt: string;
};

export function isShiftBufferEnabled(): boolean {
  return isUpstashConfigured() && process.env.MYCHECK_SHIFT_BUFFER_MODE !== 'legacy';
}

function draftKey(branchId: string, shiftId: string, userId: string): string {
  return `mycheck:${BUFFER_VERSION}:shift:${branchId}:${shiftId}:draft:${userId}`;
}

export type BufferedEntry = {
  entryId: string;
  pointRef: string;
  action: 'selesai' | 'batal' | 'skip' | 'ubah_nilai';
  value: string | null;
  skipReason: string;
  outOfRange: boolean;
  state: 'belum' | 'selesai' | 'skip';
  userId: string;
  userName: string;
  clientActionId: string;
  clientAt: string;
  at: string;
  completedAt: string | null;
  timingLabel: string | null;
  timingDeltaMinutes: number | null;
};

export type BufferedShiftState = {
  entries: Record<string, Record<string, unknown>>;
  participants: Record<string, Record<string, unknown>>;
  actions: BufferedEntry[];
  initializedAt: string;
};

function stateKey(branchId: string, shiftId: string): string {
  return `mycheck:${BUFFER_VERSION}:shift:${branchId}:${shiftId}:state`;
}

function lockKey(branchId: string, shiftId: string): string {
  return `mycheck:${BUFFER_VERSION}:shift:${branchId}:${shiftId}:lock`;
}

export async function readBufferedShiftState(
  branchId: string,
  shiftId: string,
  baseline: Omit<BufferedShiftState, 'actions' | 'initializedAt'>,
): Promise<BufferedShiftState> {
  const existing = await getJson<BufferedShiftState>(stateKey(branchId, shiftId));
  if (existing) return existing;
  return { ...baseline, actions: [], initializedAt: new Date().toISOString() };
}

export async function readExistingBufferedShiftState(
  branchId: string,
  shiftId: string,
): Promise<BufferedShiftState | null> {
  return getJson<BufferedShiftState>(stateKey(branchId, shiftId));
}

export async function writeBufferedShiftState(
  branchId: string,
  shiftId: string,
  state: BufferedShiftState,
): Promise<void> {
  await setJson(stateKey(branchId, shiftId), state, ACTIVE_TTL_SECONDS);
}

export async function withShiftBufferLock<T>(
  branchId: string,
  shiftId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const key = lockKey(branchId, shiftId);
  if (!await acquireLock(key, LOCK_TTL_SECONDS)) {
    throw new Error('SHIFT_BUFFER_BUSY');
  }
  try {
    return await callback();
  } finally {
    await releaseLock(key).catch(() => undefined);
  }
}

export async function removeBufferedShiftState(branchId: string, shiftId: string): Promise<void> {
  const draftKeys = await scanKeys(`mycheck:${BUFFER_VERSION}:shift:${branchId}:${shiftId}:draft:*`);
  await deleteKeys(stateKey(branchId, shiftId), lockKey(branchId, shiftId), ...draftKeys);
}

export type FlushResult = {
  status: 'empty' | 'flushed';
  actions: number;
  entries: number;
  logs: number;
  participants: number;
};

export async function flushBufferedShift(
  branchId: string,
  shiftId: string,
  spreadsheetId: string,
  tabMonth: string,
): Promise<FlushResult> {
  return withShiftBufferLock(branchId, shiftId, async () => {
    const state = await getJson<BufferedShiftState>(stateKey(branchId, shiftId));
    if (!state || state.actions.length === 0) {
      return { status: 'empty', actions: 0, entries: 0, logs: 0, participants: 0 };
    }

    const entriesSheet = await ensureMonthlySheet(spreadsheetId, 'Entries', tabMonth);
    const logsSheet = await ensureMonthlySheet(spreadsheetId, 'EntryLogs', tabMonth);
    const [entryRows, logRows, participantRows] = await Promise.all([
      listRowsWithNumber(spreadsheetId, entriesSheet),
      listRowsWithNumber(spreadsheetId, logsSheet),
      listRowsWithNumber(spreadsheetId, 'Participants'),
    ]);
    const loggedActions = new Set(logRows.map((row) => String(row.data.client_action_id ?? '')));
    let entries = 0;
    let logs = 0;
    let participants = 0;
    const entryUpdates: { rowNumber: number; updates: Record<string, unknown> }[] = [];
    const entryInserts: Record<string, unknown>[] = [];
    const logInserts: Record<string, unknown>[] = [];

    for (const action of state.actions) {
      if (loggedActions.has(action.clientActionId)) continue;
      const entry = state.entries[action.pointRef];
      if (!entry) continue;
      const currentEntry = entryRows.find((row) => String(row.data.id) === action.entryId);
      const entryPatch = {
        state: entry.state,
        value: entry.value ?? '',
        out_of_range: entry.out_of_range ?? false,
        completed_by: entry.completed_by ?? '',
        completed_at: entry.completed_at ?? '',
        timing_label: entry.timing_label ?? '',
        timing_delta_minutes: entry.timing_delta_minutes ?? '',
        skip_reason: entry.skip_reason ?? '',
        updated_at: entry.updated_at ?? action.at,
      };
      if (currentEntry) entryUpdates.push({ rowNumber: currentEntry.rowNumber, updates: entryPatch });
      else {
        entryInserts.push({
          id: action.entryId,
          shift_instance_id: shiftId,
          point_ref: action.pointRef,
          photo_ids: '',
          created_at: action.at,
          version: 1,
          ...entryPatch,
        });
      }
      entries++;
      logInserts.push({
        id: ulid(),
        shift_instance_id: shiftId,
        entry_id: action.entryId,
        point_ref: action.pointRef,
        action: action.action,
        outcome: 'diterima',
        user_id: action.userId,
        prev_state: '',
        new_state: action.state,
        value: action.value ?? '',
        note: action.skipReason,
        client_action_id: action.clientActionId,
        client_at: action.clientAt,
        at: action.at,
        created_at: action.at,
      });
      loggedActions.add(action.clientActionId);
      logs++;
    }

    await updateRows(spreadsheetId, entriesSheet, entryUpdates);
    await insertRows(spreadsheetId, entriesSheet, entryInserts);
    await insertRows(spreadsheetId, logsSheet, logInserts);

    const existingParticipants = new Map(
      participantRows
        .filter((row) => String(row.data.shift_instance_id) === shiftId)
        .map((row) => [String(row.data.user_id), row])
    );
    const participantUpdates: { rowNumber: number; updates: Record<string, unknown> }[] = [];
    const participantInserts: Record<string, unknown>[] = [];
    for (const participant of Object.values(state.participants)) {
      const userId = String(participant.user_id ?? '');
      if (!userId) continue;
      const current = existingParticipants.get(userId);
      const values = {
        first_action_at: participant.first_action_at ?? '',
        first_action_type: participant.first_action_type ?? '',
      };
      if (current) participantUpdates.push({ rowNumber: current.rowNumber, updates: values });
      else {
        participantInserts.push({
          id: participant.id ?? ulid(),
          shift_instance_id: shiftId,
          user_id: userId,
          ...values,
          created_at: participant.created_at ?? new Date().toISOString(),
        });
      }
      participants++;
    }

    await updateRows(spreadsheetId, 'Participants', participantUpdates);
    await insertRows(spreadsheetId, 'Participants', participantInserts);

    state.actions = [];
    await writeBufferedShiftState(branchId, shiftId, state);
    return { status: 'flushed', actions: logs, entries, logs, participants };
  });
}

export async function readBufferedDraft(
  branchId: string,
  shiftId: string,
  userId: string,
): Promise<BufferedDraftRecord | null> {
  return getJson<BufferedDraftRecord>(draftKey(branchId, shiftId, userId));
}

export async function writeBufferedDraft(
  branchId: string,
  shiftId: string,
  userId: string,
  draft: ShiftDraftPayload,
  metadata: Pick<BufferedDraftRecord, 'id' | 'createdAt' | 'serverUpdatedAt'>,
): Promise<void> {
  await setJson(draftKey(branchId, shiftId, userId), { ...draft, ...metadata }, ACTIVE_TTL_SECONDS);
}

export async function removeBufferedDraft(
  branchId: string,
  shiftId: string,
  userId: string,
): Promise<void> {
  const { deleteKeys } = await import('./redis/upstash');
  await deleteKeys(draftKey(branchId, shiftId, userId));
}
