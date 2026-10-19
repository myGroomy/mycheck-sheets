// lib/notify-events.ts
// Fase 14 — event operasional -> sheet Notifications per cabang.
//
// Semua push di modul ini best-effort: kegagalan Sheets tidak boleh
// menggagalkan aksi utama (buka/tutup shift, isi item, sinkronisasi).
// Dedup on retry memakai `dedupKey`: dari key + penerima diturunkan id
// deterministik, dan baris dengan id sama tidak pernah ditulis dua kali
// walau request yang sama diulang.

import { createHash } from 'crypto';
import { asStr, findRowFresh, listRowsWithNumberFresh, insertRow } from './store';
import { pushNotification } from './incidents';
import { ensureSheet } from './google/sheets';
import { STATIC_SHEETS } from './schema/registry';
import { listAllUsers, branchIdsOf, type UserRow } from './google/registry-admin';

/** Id deterministik untuk satu notifikasi dedup-key + penerima. */
export function dedupNotificationId(dedupKey: string, userId: string): string {
  return 'ntf' + createHash('sha1').update(`${dedupKey}::${userId}`).digest('hex').slice(0, 24);
}

export interface NotificationTarget {
  userId: string;
}

/**
 * Tulis satu baris Notifications kecuali id dedup-nya sudah ada.
 * Return true bila baris baru ditulis, false bila duplikat.
 */
export async function pushNotificationDedup(
  spreadsheetId: string,
  input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    link?: string;
    dedupKey?: string;
  }
): Promise<boolean> {
  try {
    await ensureSheet(spreadsheetId, 'Notifications', STATIC_SHEETS['Notifications']);
  } catch {
    // lanjut coba insert
  }
  const dedupKey = input.dedupKey ?? '';
  if (dedupKey) {
    const id = dedupNotificationId(dedupKey, input.userId);
    const existing = await findRowFresh(spreadsheetId, 'Notifications', 'id', id);
    if (existing) return false;
    const now = new Date().toISOString();
    try {
      await insertRow(spreadsheetId, 'Notifications', {
        id,
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? '',
        is_read: false,
        created_at: now,
      });
      return true;
    } catch {
      return false;
    }
  }
  // Tanpa dedupKey: pakai angular fase lama (ulid) — user_id di sheet
  // Notifications memakai Username (sama dengan ctx.user.id).
  await pushNotification(spreadsheetId, input);
  return true;
}

/** Baris Participants yang layak menerima event shift (tanpa aktor). */
function participantUserIds(rows: Record<string, unknown>[], excludeUserId: string): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = asStr(row['user_id']);
    if (id && id !== excludeUserId) ids.add(id);
  }
  return [...ids];
}

/** User aktif tetap cabang yang diakses (untuk fan-out event buka/tutup toko). */
export async function branchUserIds(branchId: string, excludeUserId: string): Promise<string[]> {
  try {
    const users = await listAllUsers();
    // kolom Notifications.user_id memakai Username (sama dengan ctx.user.id).
    const matched = users.filter(
      (u: UserRow) =>
        u.Aktif && u.Username !== excludeUserId && branchIdsOf(u).includes(branchId)
    );
    return [...new Set(matched.map((u) => u.Username).filter(Boolean))];
  } catch {
    return [];
  }
}

interface EventBase {
  spreadsheetId: string;
  branchId: string;
  shiftInstanceId: string;
  actorId: string;
  actorName: string;
  shiftName: string;
  link?: string;
}

/** Event \"Buka shift\" — fan-out ke user cabang lain + pelacak dedup. */
export async function notifyShiftOpened(base: EventBase): Promise<void> {
  const targets = await branchUserIds(base.branchId, base.actorId);
  await Promise.all(
    targets.map((userId) =>
      pushNotificationDedup(base.spreadsheetId, {
        userId,
        type: 'shift_open',
        title: 'Shift dibuka',
        body: `${base.actorName} membuka shift ${base.shiftName}.`,
        link: base.link ?? `/shift/${base.shiftInstanceId}`,
        dedupKey: `shift_open:${base.shiftInstanceId}:${userId}`,
      })
    )
  );
}

/** Event \"Tutup shift\" — fan-out ke peserta shift (tanpa penutup). */
export async function notifyShiftClosed(base: EventBase): Promise<void> {
  let participantRows: Record<string, unknown>[] = [];
  try {
    participantRows = await listRowsWithNumberFresh(base.spreadsheetId, 'Participants').then(
      (rows) => rows.map((r) => r.data).filter((r) => asStr(r['shift_instance_id']) === base.shiftInstanceId)
    );
  } catch {
    return;
  }
  await Promise.all(
    participantUserIds(participantRows, base.actorId).map((userId) =>
      pushNotificationDedup(base.spreadsheetId, {
        userId,
        type: 'shift_close',
        title: 'Shift ditutup',
        body: `${base.actorName} menutup shift ${base.shiftName}.`,
        link: base.link ?? `/report`,
        dedupKey: `shift_close:${base.shiftInstanceId}:${userId}`,
      })
    )
  );
}

/**
 * Event \"X mengisi item A\" — hanya dituju ke PJ, dan hanya bila pengisi
 * bukan PJ itu sendiri.
 */
export async function notifyEntryDone(
  base: {
    spreadsheetId: string;
    shiftInstanceId: string;
    pjUserId: string;
    workerUserId: string;
    workerName: string;
    pointRef: string;
    pointTitle: string;
    link?: string;
  }
): Promise<void> {
  if (base.workerUserId === base.pjUserId) return;
  await pushNotificationDedup(base.spreadsheetId, {
    userId: base.pjUserId,
    type: 'entry_done',
    title: 'Item checklist dikerjakan',
    body: `${base.workerName} mengisi item ${base.pointTitle}.`,
    link: base.link ?? `/shift/${base.shiftInstanceId}`,
    dedupKey: `entry_done:${base.pointRef}:${base.workerUserId}`,
  });
}

/** Notifikasi status sinkronisasi: berhasil / gagal / tersinkron ulang. */
export async function notifySync(
  base: {
    spreadsheetId: string;
    shiftInstanceId: string;
    scopeIds: string[];
    status: 'berhasil' | 'tersinkron_ulang' | 'gagal';
    detail?: string;
    link?: string;
  }
): Promise<void> {
  const type = `sync_${base.status}`;
  const title =
    base.status === 'berhasil'
      ? 'Sinkronisasi berhasil'
      : base.status === 'tersinkron_ulang'
        ? 'Shift tersinkron ulang'
        : 'Sinkronisasi gagal';
  const body = base.detail ?? title;
  await Promise.all(
    base.scopeIds.map((userId) =>
      pushNotificationDedup(base.spreadsheetId, {
        userId,
        type,
        title,
        body,
        link: base.link ?? `/shift/${base.shiftInstanceId}`,
        dedupKey: `${type}:${base.shiftInstanceId}:${userId}`,
      })
    )
  );
}

/** Daftar anggota peserta shift yang aktif (untuk disorot saat sync gagal). */
export async function shiftParticipantIds(
  spreadsheetId: string,
  shiftInstanceId: string
): Promise<string[]> {
  try {
    const rows = await listRowsWithNumberFresh(spreadsheetId, 'Participants');
    return participantUserIds(
      rows.map((r) => r.data).filter((r) => asStr(r['shift_instance_id']) === shiftInstanceId),
      ''
    );
  } catch {
    return [];
  }
}


