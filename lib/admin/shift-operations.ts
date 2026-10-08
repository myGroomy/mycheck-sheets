// lib/admin/shift-operations.ts
// Aksi admin terhadap shift instance yang sedang berjalan (PRD §7.8).
//
// Empat aksi:
//   - Tutup paksa (ADM-OP-02, BR-34) — syarat BR-30 tidak diberlakukan,
//     laporan ditandai "ditutup paksa", item wajib yang belum selesai ditandai
//     tidak lengkap, alasan wajib dicatat.
//   - Ganti PJ (ADM-OP-03) — pindahkan tanggung jawab ke petugas lain yang punya
//     akses cabang; alasan wajib; tercatat dari siapa ke siapa.
//   - Void (ADM-OP-05) — batalkan shift yang dibuka tidak sengaja; alasan wajib;
//     data tetap tersimpan tapi tidak masuk statistik. Tidak menghapus baris (BR-40).
//   - Buka atas nama (ADM-OP-04) — PJ lupa membuka.
//
// Soal penjaga: tutup paksa, ganti PJ, dan void wajib alasan + PIN (ADM-SEC-01).
// Buka atas nama TIDAK diminta PIN oleh ADM-SEC-01, jadi cukup alasan.

import { ulid } from 'ulid';
import { createHash } from 'crypto';
import type { AuthContext } from '../api-auth';
import { appendAuditLogFor } from '../db/audit';
import { getServerTime } from '../db/server-time';
import {
  asStr,
  filterRows,
  insertRow,
  listMonthlyRows,
  updateRow,
} from '../store';
import { resolveCabang } from '../google/registry';
import { listAllUsers } from '../google/registry-admin';
import { resolveInstance } from '../instance-resolver';

export type ShiftOpAction = 'force_close' | 'change_pj' | 'void';

export interface ShiftOpResult {
  ok: true;
  message: string;
  reportNumber?: string;
}

/** Status shift yang masih boleh diolah admin. */
function isRunning(instance: Record<string, unknown>): boolean {
  return asStr(instance['status']) === 'berjalan';
}

/**
 * Daftar shift instance lintas cabang yang bisa diakses admin.
 * `status` default 'berjalan' (ADM-OP-01: "lihat semua shift berjalan").
 */
export async function listShiftInstancesAcrossBranches(
  ctx: AuthContext,
  status?: string
): Promise<Record<string, unknown>[]> {
  const wanted = status ?? 'berjalan';
  const out: Record<string, unknown>[] = [];

  for (const branchId of ctx.branchIds) {
    try {
      const { spreadsheetId, cabang } = await resolveCabang(branchId);
      const instances = await filterRows(
        spreadsheetId,
        'ShiftInstances',
        (r) => asStr(r['status']) === wanted
      );
      const definitions = await filterRows(spreadsheetId, 'ShiftDefinitions', () => true);
      const defName = new Map(
        definitions.map((d) => [asStr(d['id']), asStr(d['name'])])
      );

      for (const inst of instances) {
        out.push({
          id: asStr(inst['id']),
          branchId,
          branchName: asStr(cabang['Nama_Cabang']) || branchId,
          shiftDefinitionId: asStr(inst['shift_definition_id']),
          shiftName: defName.get(asStr(inst['shift_definition_id'])) ?? '—',
          shiftDate: asStr(inst['shift_date']),
          status: asStr(inst['status']),
          pjUserId: asStr(inst['pj_user_id']),
          openedBy: asStr(inst['opened_by']),
          openedAt: asStr(inst['opened_at']),
          closeType: asStr(inst['close_type']),
          isTest: asStr(inst['is_test']).toLowerCase() === 'true',
          isIncomplete: asStr(inst['is_incomplete']).toLowerCase() === 'true',
          voidReason: asStr(inst['void_reason']),
          forceCloseReason: asStr(inst['force_close_reason']),
        });
      }
    } catch {
      // Cabang tanpa spreadsheet dilewati — satu cabang rusak tidak boleh
      // menggagalkan seluruh daftar.
    }
  }

  out.sort((a, b) => String(b['shiftDate']).localeCompare(String(a['shiftDate'])));
  return out;
}

/** Pastikan user target ada, aktif, dan punya akses ke cabang tersebut (ADM-OP-03). */
async function assertUserHasBranchAccess(
  userId: string,
  branchId: string
): Promise<{ ok: true; nama: string } | { ok: false; error: string }> {
  const users = await listAllUsers();
  const target = users.find((u) => u.User_ID === userId);
  if (!target) return { ok: false, error: 'User tidak ditemukan.' };
  if (!target.Aktif) return { ok: false, error: 'User sedang nonaktif.' };

  const akses = asStr(target.Cabang_ID)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!akses.includes(branchId)) {
    return { ok: false, error: `User tidak punya akses ke cabang ${branchId}.` };
  }
  return { ok: true, nama: asStr(target.Nama) || asStr(target.Username) };
}

/** Hitung ulang status item wajib untuk laporan pada tutup paksa (BR-34). */
function summariseEntries(entryRows: Record<string, unknown>[]) {
  return {
    total: entryRows.length,
    done: entryRows.filter((r) => asStr(r['state']) === 'selesai').length,
    skipped: entryRows.filter((r) => asStr(r['state']) === 'skip').length,
    unfinished: entryRows.filter((r) => asStr(r['state']) === 'belum').length,
  };
}

/**
 * Tutup paksa (ADM-OP-02 / BR-34). Melewati syarat BR-30: tidak butuh semua
 * item selesai dan tidak butuh handover terisi — tapi alasan wajib dicatat dan
 * laporan ditandai tidak lengkap.
 */
async function forceClose(
  ctx: AuthContext,
  shiftInstanceId: string,
  reason: string
): Promise<ShiftOpResult> {
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) throw new Error('Shift tidak ditemukan');
  const { instance, rowNumber, spreadsheetId, branchId, tabMonth } = resolved;

  if (!isRunning(instance)) {
    throw new Error(
      `Hanya shift berjalancan bisa ditutup paksa. Status saat ini: ${asStr(instance['status'])}.`
    );
  }

  const now = getServerTime().toISOString();
  const entryRows = await listMonthlyRows(spreadsheetId, 'Entries', tabMonth);
  const mine = entryRows.filter((e) => asStr(e['shift_instance_id']) === shiftInstanceId);
  const stats = summariseEntries(mine);

  const reportNumber = `R-${String(instance['shift_date']).replace(/-/g, '')}-${shiftInstanceId.slice(-4)}`;
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        shiftInstanceId,
        entries: mine.map((e) => [asStr(e['point_ref']), asStr(e['state']), asStr(e['value'])]),
        forceClose: true,
      })
    )
    .digest('hex');

  const existingReport = await filterRows(
    spreadsheetId,
    'Reports',
    (r) => asStr(r['shift_instance_id']) === shiftInstanceId
  );
  if (!existingReport[0]) {
    await insertRow(spreadsheetId, 'Reports', {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      report_number: reportNumber,
      generated_by: ctx.user.id,
      generated_at: now,
      is_locked: true,
      summary_stats: JSON.stringify({ ...stats, closed_paksa: true }),
      content_hash: contentHash,
      unlock_count: 0,
      created_at: now,
      updated_at: now,
    });
  }

  await updateRow(spreadsheetId, 'ShiftInstances', rowNumber, {
    status: 'ditutup',
    closed_at: now,
    closed_by: ctx.user.id,
    close_type: 'paksa',
    force_close_reason: reason,
    // BR-34: item wajib yang belum selesai ditandai tidak lengkap.
    is_incomplete: stats.unfinished > 0,
    updated_at: now,
  });

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'force_close_shift',
    objectType: 'shift_instance',
    objectId: shiftInstanceId,
    branchId,
    shiftInstanceId,
    before: { status: asStr(instance['status']), closeType: asStr(instance['close_type']) },
    after: { status: 'ditutup', closeType: 'paksa', reportNumber, isIncomplete: stats.unfinished > 0 },
    reason,
  });

  return {
    ok: true,
    message: `Shift ditutup paksa. ${stats.unfinished} item belum selesai ditandai tidak lengkap.`,
    reportNumber,
  };
}

/** Ganti PJ (ADM-OP-03). Alasan wajib; tercatat dari siapa ke siapa. */
async function changePj(
  ctx: AuthContext,
  shiftInstanceId: string,
  newPjUserId: string,
  reason: string
): Promise<ShiftOpResult> {
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) throw new Error('Shift tidak ditemukan');
  const { instance, rowNumber, spreadsheetId, branchId } = resolved;

  if (!isRunning(instance)) {
    throw new Error(
      `Hanya shift berjalan bisa PJ-nya diganti. Status saat ini: ${asStr(instance['status'])}.`
    );
  }

  const previousPj = asStr(instance['pj_user_id']);
  if (previousPj === newPjUserId) {
    throw new Error('User tersebut sudah menjadi PJ shift ini.');
  }

  const check = await assertUserHasBranchAccess(newPjUserId, branchId);
  if (!check.ok) throw new Error(check.error);

  const now = getServerTime().toISOString();
  await updateRow(spreadsheetId, 'ShiftInstances', rowNumber, {
    pj_user_id: newPjUserId,
    updated_at: now,
  });

  const names = await listAllUsers();
  const nameOf = (id: string) => {
    const u = names.find((x) => x.User_ID === id);
    return u ? asStr(u.Nama) || asStr(u.Username) : id;
  };

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'change_shift_pj',
    objectType: 'shift_instance',
    objectId: shiftInstanceId,
    branchId,
    shiftInstanceId,
    before: { pjUserId: previousPj, pjName: nameOf(previousPj) },
    after: { pjUserId: newPjUserId, pjName: check.nama },
    reason,
  });

  return { ok: true, message: `PJ shift diganti ke ${check.nama}.` };
}

/**
 * Void shift (ADM-OP-05). Baris TIDAK dihapus (BR-40) — hanya ditandai void
 * supaya tidak dihitung di statistik. Hanya shift berjalan boleh di-void:
 * shift yang sudah ditutup punya laporan terkunci (BR-32) dan koreksinya
 * lewat addendum, bukan void.
 */
async function voidShift(
  ctx: AuthContext,
  shiftInstanceId: string,
  reason: string
): Promise<ShiftOpResult> {
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) throw new Error('Shift tidak ditemukan');
  const { instance, rowNumber, spreadsheetId, branchId } = resolved;

  if (!isRunning(instance)) {
    throw new Error(
      `Hanya shift berjalan bisa di-void. Status saat ini: ${asStr(instance['status'])}. ` +
        'Shift yang sudah ditutup dikoreksi lewat addendum.'
    );
  }

  const now = getServerTime().toISOString();
  await updateRow(spreadsheetId, 'ShiftInstances', rowNumber, {
    status: 'void',
    void_reason: reason,
    void_by: ctx.user.id,
    void_at: now,
    updated_at: now,
  });

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'void_shift',
    objectType: 'shift_instance',
    objectId: shiftInstanceId,
    branchId,
    shiftInstanceId,
    before: { status: asStr(instance['status']) },
    after: { status: 'void' },
    reason,
  });

  return { ok: true, message: 'Shift di-void. Data tetap tersimpan, tidak dihitung di statistik.' };
}

export async function runShiftOperation(
  ctx: AuthContext,
  action: ShiftOpAction,
  shiftInstanceId: string,
  params: { reason: string; newPjUserId?: string }
): Promise<ShiftOpResult> {
  if (action === 'force_close') return forceClose(ctx, shiftInstanceId, params.reason);
  if (action === 'change_pj') {
    if (!params.newPjUserId) throw new Error('User PJ baru wajib dipilih.');
    return changePj(ctx, shiftInstanceId, params.newPjUserId, params.reason);
  }
  if (action === 'void') return voidShift(ctx, shiftInstanceId, params.reason);
  throw new Error('Aksi tidak dikenal.');
}

/**
 * Buka shift atas nama petugas (ADM-OP-04). Tanpa PIN — ADM-SEC-01 tidak
 * memasukkan aksi ini ke daftar aksi sensitif. Alasan tetap wajib.
 */
export async function openShiftOnBehalf(
  ctx: AuthContext,
  shiftDefinitionId: string,
  targetUserId: string,
  reason: string
): Promise<ShiftOpResult & { shiftInstanceId: string }> {
  const branchId = ctx.branchIds[0];
  if (!branchId) throw new Error('Admin tidak punya akses cabang.');

  const { spreadsheetId } = await resolveCabang(branchId);

  const definitions = await filterRows(
    spreadsheetId,
    'ShiftDefinitions',
    (r) => asStr(r['id']) === shiftDefinitionId
  );
  const definition = definitions[0];
  if (!definition) throw new Error('Definisi shift tidak ditemukan');

  const check = await assertUserHasBranchAccess(targetUserId, branchId);
  if (!check.ok) throw new Error(check.error);

  const { getShiftDate } = await import('../shift/time');
  const { buildTemplateSnapshot, hashSnapshot } = await import('../db/snapshot');
  const now = getServerTime();
  const shiftDate = getShiftDate(now, 'Asia/Jakarta');
  const snapshot = await buildTemplateSnapshot(spreadsheetId, shiftDefinitionId, 'Asia/Jakarta');
  const shiftInstanceId = ulid();

  await insertRow(spreadsheetId, 'ShiftInstances', {
    id: shiftInstanceId,
    shift_definition_id: shiftDefinitionId,
    shift_date: shiftDate,
    tab_month: shiftDate.slice(0, 7),
    status: 'berjalan',
    pj_user_id: targetUserId,
    opened_by: ctx.user.id,
    opened_at: now.toISOString(),
    opened_outside_hours: false,
    is_test: false,
    snapshot_encoding: 'json',
    template_snapshot: JSON.stringify(snapshot),
    snapshot_hash: hashSnapshot(snapshot),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  await insertRow(spreadsheetId, 'Participants', {
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    user_id: targetUserId,
    first_action_at: now.toISOString(),
    first_action_type: 'buka_atas_nama',
    created_at: now.toISOString(),
  });

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'open_shift_on_behalf',
    objectType: 'shift_instance',
    objectId: shiftInstanceId,
    branchId,
    shiftInstanceId,
    after: { status: 'berjalan', pjUserId: targetUserId, openedBy: ctx.user.id },
    reason,
  });

  return {
    ok: true,
    message: `Shift dibuka atas nama ${check.nama}.`,
    shiftInstanceId,
  };
}