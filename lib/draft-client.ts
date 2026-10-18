import type { ShiftDraftPayload } from '@/lib/draft-types';

export function shiftDraftStorageKey(userId: string, shiftInstanceId: string) {
  return `mycheck:shift-draft:${userId}:${shiftInstanceId}`;
}

export function readLocalShiftDraft(userId: string, shiftInstanceId: string): ShiftDraftPayload | null {
  try {
    const raw = localStorage.getItem(shiftDraftStorageKey(userId, shiftInstanceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShiftDraftPayload;
    return parsed?.shiftInstanceId === shiftInstanceId && parsed?.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalShiftDraft(draft: ShiftDraftPayload) {
  try { localStorage.setItem(shiftDraftStorageKey(draft.userId, draft.shiftInstanceId), JSON.stringify(draft)); } catch { /* storage penuh/private mode */ }
}

export function clearLocalShiftDraft(userId: string, shiftInstanceId: string) {
  try { localStorage.removeItem(shiftDraftStorageKey(userId, shiftInstanceId)); } catch { /* abaikan */ }
}

export function clearLocalShiftDrafts(userId: string, shiftIds: string[]) {
  shiftIds.forEach((shiftId) => clearLocalShiftDraft(userId, shiftId));
}

