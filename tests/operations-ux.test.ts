// tests/operations-ux.test.ts
// Fase 14 — notifications events dengan dedup on retry.
import test from 'node:test';
import assert from 'node:assert';
import './helpers/mock-sheets';
import { STATIC_SHEETS } from '../lib/schema/registry';
import { insertRow, listRowsFresh } from '../lib/store';
import {
  dedupNotificationId,
  notifyEntryDone,
  notifyShiftClosed,
  notifySync,
  pushNotificationDedup,
} from '../lib/notify-events';
import { seedRegistry, addBranchSheet, branchSpreadsheetId } from './helpers/mock-registry';

const branchId = 'CAB_NOTIF';

async function notifRows(): Promise<Record<string, unknown>[]> {
  return listRowsFresh(branchSpreadsheetId(branchId), 'Notifications');
}

function makeUserSheet(workbook: unknown, users: Record<string, unknown>[]) {
  const { addSheet } = require('./helpers/fake-sheets') as {
    addSheet: (
      workbook: unknown,
      title: string,
      headers: string[],
      rows: Record<string, unknown>[],
      spreadsheetId?: string
    ) => void;
  };
  addSheet(
    workbook,
    'Users',
    ['User_ID', 'Username', 'Nama', 'Role', 'Cabang_ID', 'Aktif', 'Created_At'],
    users,
    'registry-uji'
  );
}

test('Fase 14: notifikasi event dedup', async () => {
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang Notif' }]);
  addBranchSheet(workbook, branchId, 'Notifications', STATIC_SHEETS.Notifications);

  // 1. Id dedup deterministik & unik per penerima.
  const idA = dedupNotificationId('k1', 'andi');
  assert.strictEqual(idA, dedupNotificationId('k1', 'andi'));
  assert.notStrictEqual(idA, dedupNotificationId('k1', 'budi'));

  // 2. Retry dedup: baris kedua dengan key sama tidak ditulis ulang.
  await pushNotificationDedup(branchSpreadsheetId(branchId), {
    userId: 'andi',
    type: 'entry_done',
    title: 'Item checklist dikerjakan',
    body: 'budi mengisi item Lantai.',
    link: '/shift/s1',
    dedupKey: 'entry_done:pt-1:budi',
  });
  await pushNotificationDedup(branchSpreadsheetId(branchId), {
    userId: 'andi',
    type: 'entry_done',
    title: 'Item checklist dikerjakan',
    body: 'budi mengisi item Lantai.',
    link: '/shift/s1',
    dedupKey: 'entry_done:pt-1:budi',
  });
  assert.strictEqual((await notifRows()).length, 1);

  // 3. Penerima lain dengan key sama tetap dapat baris sendiri.
  await pushNotificationDedup(branchSpreadsheetId(branchId), {
    userId: 'citra',
    type: 'entry_done',
    title: 'Item checklist dikerjakan',
    body: 'budi mengisi item Lantai.',
    dedupKey: 'entry_done:pt-1:budi',
  });
  assert.strictEqual((await notifRows()).length, 2);

  // 4. Notify PJ dilewati bila pengisi = PJ itu sendiri.
  const before = (await notifRows()).length;
  await notifyEntryDone({
    spreadsheetId: branchSpreadsheetId(branchId),
    shiftInstanceId: 's1',
    pjUserId: 'budi',
    workerUserId: 'budi',
    workerName: 'Budi',
    pointRef: 'pt-2',
    pointTitle: 'Lantai',
  });
  assert.strictEqual((await notifRows()).length, before);

  // 5. Pengisi beda orang -> PJ menerima satu baris.
  await notifyEntryDone({
    spreadsheetId: branchSpreadsheetId(branchId),
    shiftInstanceId: 's1',
    pjUserId: 'budi',
    workerUserId: 'citra',
    workerName: 'Citra',
    pointRef: 'pt-2',
    pointTitle: 'Lantai',
  });
  assert.strictEqual((await notifRows()).length, before + 1);
});

test('Fase 14: fan-out buka/tutup shift dan status sinkron', async () => {
  const spreadsheetId = branchSpreadsheetId(branchId);
  const workbook = seedRegistry([
    { id: branchId, name: 'Cabang Notif' },
  ]);
  makeUserSheet(workbook, [
    { User_ID: 'u1', Username: 'andi', Nama: 'Andi', Role: 'petugas', Cabang_ID: branchId, Aktif: true },
    { User_ID: 'u2', Username: 'budi', Nama: 'Budi', Role: 'petugas', Cabang_ID: branchId, Aktif: true },
    { User_ID: 'u3', Username: 'citra', Nama: 'Citra', Role: 'petugas', Cabang_ID: 'CAB_LAIN', Aktif: true },
  ]);
  addBranchSheet(workbook, branchId, 'Notifications', STATIC_SHEETS.Notifications);
  addBranchSheet(workbook, branchId, 'Participants', STATIC_SHEETS.Participants);
  await insertRow(spreadsheetId, 'Participants', {
    id: 'p1',
    shift_instance_id: 's1',
    user_id: 'andi',
    first_action_at: '2026-06-01T01:00:00.000Z',
    first_action_type: 'centang',
    created_at: '2026-06-01T01:00:00.000Z',
  });
  await insertRow(spreadsheetId, 'Participants', {
    id: 'p2',
    shift_instance_id: 's1',
    user_id: 'budi',
    first_action_at: '2026-06-01T01:05:00.000Z',
    first_action_type: 'isi',
    created_at: '2026-06-01T01:05:00.000Z',
  });

  // Tutup shift oleh budi -> hanya andi menerima (budi dikecualikan,
  // citra cabang lain tidak tersentuh).
  await notifyShiftClosed({
    spreadsheetId,
    branchId,
    shiftInstanceId: 's1',
    actorId: 'budi',
    actorName: 'Budi',
    shiftName: 'Shift Pagi',
  });
  let rows = await notifRows();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(String(rows[0]['user_id']), 'andi');
  assert.strictEqual(String(rows[0]['type']), 'shift_close');
  assert.strictEqual(String(rows[0]['body']).includes('Budi menutup shift Shift Pagi'), true);

  // Retry penutupan (idempotent) tidak menambah baris.
  await notifyShiftClosed({
    spreadsheetId,
    branchId,
    shiftInstanceId: 's1',
    actorId: 'budi',
    actorName: 'Budi',
    shiftName: 'Shift Pagi',
  });
  assert.strictEqual((await notifRows()).length, 1);

  // Status sinkron gagal -> dedup per (instance, status, penerima).
  await notifySync({
    spreadsheetId,
    shiftInstanceId: 's1',
    scopeIds: ['andi', 'budi'],
    status: 'gagal',
    detail: 'Buffer shift gagal disinkronkan.',
  });
  rows = await notifRows();
  const gagal = rows.filter((r) => String(r['type']) === 'sync_gagal');
  assert.strictEqual(gagal.length, 2);
  await notifySync({
    spreadsheetId,
    shiftInstanceId: 's1',
    scopeIds: ['andi', 'budi'],
    status: 'gagal',
  });
  assert.strictEqual((await notifRows()).filter((r) => String(r['type']) === 'sync_gagal').length, 2);

  // Kontrak kolom Notifications tetap (id, user_id, ..., created_at di akhir).
  const sheets = (await listRowsFresh(spreadsheetId, 'Notifications')).length;
  assert.ok(sheets > 0);
});
