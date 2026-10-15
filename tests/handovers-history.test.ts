// tests/handovers-history.test.ts
// Uji `GET /api/handovers`: riwayat handover lintas shift.
//
// Berbeda dengan `/api/shifts/[id]/handover-prev` yang hanya mengembalikan satu
// shift sebelumnya, endpoint ini mengembalikan DAFTAR shift tertutup terbaru
// tanpa butuh shift yang sedang berjalan — itulah yang membuat petugas bisa
// melihat shift sebelumnya sekaligus shift sebelum-sebelumnya.

import test from 'node:test';
import assert from 'node:assert/strict';

// Urutan impor penting: mock-sheets dulu (fake client), lalu mock-auth (stub
// session), baru helper lain.
import { seedRegistry, addBranchSheet } from './helpers/mock-registry';
import { installSessionStub, setSession, clearSession, makeRequest } from './helpers/mock-auth';
import { MONTHLY_SHEETS, STATIC_SHEETS } from '../lib/google/branch-schema';

installSessionStub();

const BASE = 'http://localhost:3000';
const CAB1 = 'CAB1';
const CAB2 = 'CAB2';

interface SeedOptions {
  /** Berapa shift tertutup yang tersedia. */
  closed?: number;
  /** Tambahkan shift yang masih berjalan (harus diabaikan). */
  withRunning?: boolean;
}

function snapshotFor(fieldLabel: string): string {
  return JSON.stringify({
    v: 1,
    shift: { id: 'S1', name: 'Shift Pagi', start_time: '08:00', end_time: '16:00' },
    settings: {},
    categories: [],
    handover_fields: [
      {
        id: 'F1',
        label: fieldLabel,
        field_type: 'teks',
        input_types: ['teks'],
        options: null,
        is_required: true,
        sort_order: 0,
      },
    ],
  });
}

/**
 * Bangun baris shift tertutup + handover-nya. Indeks i = 1..closed, tanggal
 * dan `opened_at` naik seiring i, jadi i terbesar = shift paling baru.
 */
function buildRows(options: SeedOptions = {}) {
  const closed = options.closed ?? 3;
  const instances: Record<string, unknown>[] = [];
  const handovers: Record<string, unknown>[] = [];

  for (let i = 1; i <= closed; i++) {
    const day = String(i).padStart(2, '0');
    instances.push({
      id: `SI_${i}`,
      shift_definition_id: 'S1',
      shift_date: `2026-10-${day}`,
      tab_month: '2026-10',
      // Shift paling baru ditutup paksa — status ini tetap harus tampil.
      status: i === closed ? 'ditutup_paksa' : 'ditutup',
      opened_at: `2026-10-${day}T00:00:00.000Z`,
      closed_at: `2026-10-${day}T16:00:00.000Z`,
      template_snapshot: snapshotFor('Kas Akhir'),
    });
    handovers.push({
      id: `HO_${i}`,
      shift_instance_id: `SI_${i}`,
      values: JSON.stringify({ F1: `nilai shift ${i}` }),
      free_text: `catatan shift ${i}`,
      photo_ids: '[]',
      submitted_by: 'petugas_lama',
      submitted_at: `2026-10-${day}T15:00:00.000Z`,
    });
  }

  if (options.withRunning) {
    instances.push({
      id: 'SI_RUNNING',
      shift_definition_id: 'S1',
      shift_date: '2026-10-20',
      tab_month: '2026-10',
      status: 'berjalan',
      opened_at: '2026-10-20T00:00:00.000Z',
      template_snapshot: snapshotFor('Kas Akhir'),
    });
  }

  return { instances, handovers };
}

/** Siapkan CAB1 berisi N shift tertutup beserta handover-nya. */
function seedBranch(options: SeedOptions = {}) {
  const workbook = seedRegistry([
    { id: CAB1, name: 'Cabang 1' },
    { id: CAB2, name: 'Cabang 2' },
  ]);
  const { instances, handovers } = buildRows(options);

  addBranchSheet(workbook, CAB1, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [
    { id: 'S1', name: 'Shift Pagi', start_time: '08:00', end_time: '16:00', is_active: true },
  ]);
  addBranchSheet(workbook, CAB1, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, instances);
  addBranchSheet(workbook, CAB1, 'Handovers_2026-10', MONTHLY_SHEETS.Handovers, handovers);
}

function asPetugas(user = 'petugas1', branch = CAB1) {
  setSession({ username: user, nama: user, role: 'petugas', cabangId: branch });
}

async function callGet(query = '') {
  const { GET } = await import('../app/api/handovers/route');
  return GET(makeRequest('GET', `${BASE}/api/handovers${query}`));
}

// ============================================================
// Guard
// ============================================================

test('401 tanpa session', async () => {
  seedBranch();
  clearSession();
  const res = await callGet();
  assert.equal(res.status, 401);
});

// ============================================================
// Riwayat lintas shift
// ============================================================

test('mengembalikan lebih dari satu shift tertutup, terbaru lebih dulu', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.entries.length, 3);
  assert.equal(body.entries[0].shiftInstanceId, 'SI_3');
  assert.equal(body.entries[1].shiftInstanceId, 'SI_2');
  assert.equal(body.entries[2].shiftInstanceId, 'SI_1');
});

test('handover shift kedua dari belakang ikut terbawa — inti kebutuhan petugas', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  // entries[1] = shift sebelum-sebelumnya; isinya harus lengkap, bukan kosong.
  const entry = body.entries[1];
  assert.equal(entry.shiftInstanceId, 'SI_2');
  assert.ok(entry.handover, 'handover shift kedua dari belakang harus ada');
  assert.equal(entry.handover.fields[0].label, 'Kas Akhir');
  assert.equal(entry.handover.fields[0].display, 'nilai shift 2');
  assert.equal(entry.handover.freeText, 'catatan shift 2');
});

test('mengabaikan shift yang masih berjalan', async () => {
  seedBranch({ withRunning: true });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  const ids = body.entries.map((e: { shiftInstanceId: string }) => e.shiftInstanceId);
  assert.ok(!ids.includes('SI_RUNNING'));
});

test('menghormati parameter limit', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet('?limit=2');
  const body = await res.json();
  assert.equal(body.entries.length, 2);
});

test('limit dibatasi maksimum 30', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet('?limit=999');
  const body = await res.json();
  assert.ok(body.entries.length <= 30);
});

test('daftar cabang yang bisa diakses ikut dikembalikan untuk filter', async () => {
  seedBranch();
  asPetugas('petugas1', CAB1);
  const res = await callGet();
  const body = await res.json();

  assert.ok(Array.isArray(body.branches));
  assert.ok(body.branches.some((b: { id: string }) => b.id === CAB1));
  // Petugas CAB1 tidak boleh melihat CAB2 sebagai pilihan filter.
  assert.ok(!body.branches.some((b: { id: string }) => b.id === CAB2));
});

test('filter branchId membatasi hasil ke satu cabang', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet(`?branchId=${CAB2}`);
  const body = await res.json();
  // Tidak ada data di CAB2 -> kosong, bukan error.
  assert.equal(res.status, 200);
  assert.equal(body.entries.length, 0);
});

test('status ditutup paksa tetap ikut ditampilkan', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.equal(body.entries[0].status, 'ditutup_paksa');
});

test('admin boleh membaca handover cabang yang bisa diaksesnya', async () => {
  seedBranch();
  setSession({ username: 'admin1', nama: 'Admin', role: 'admin', cabangId: '' });
  const res = await callGet();
  assert.equal(res.status, 200);
});

test('filledCount dan photoCount tersedia untuk ringkasan', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.equal(body.entries[0].filledCount, 1);
  assert.equal(body.entries[0].photoCount, 0);
});

test('ack default belum dibaca sebelum ada penandaan', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.deepEqual(body.entries[0].ack, { readAt: null, readByCount: 0, readByMe: false });
});

test('branchName terisi dari registry', async () => {
  seedBranch();
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.equal(body.entries[0].branchName, 'Cabang 1');
});

test('daftar kosong bila cabang belum punya shift tertutup', async () => {
  const workbook = seedRegistry([{ id: CAB1, name: 'Cabang 1' }]);
  addBranchSheet(workbook, CAB1, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, []);
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.entries, []);
});

test('shift tertutup tanpa handover tetap muncul dengan handover null', async () => {
  const workbook = seedRegistry([{ id: CAB1, name: 'Cabang 1' }]);
  addBranchSheet(workbook, CAB1, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, [
    {
      id: 'SI_KOSONG',
      shift_definition_id: 'S1',
      shift_date: '2026-10-05',
      tab_month: '2026-10',
      status: 'ditutup',
      opened_at: '2026-10-05T00:00:00.000Z',
      closed_at: '2026-10-05T16:00:00.000Z',
      template_snapshot: snapshotFor('Kas Akhir'),
    },
  ]);
  addBranchSheet(workbook, CAB1, 'Handovers_2026-10', MONTHLY_SHEETS.Handovers, []);

  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.entries.length, 1);
  assert.equal(body.entries[0].handover, null);
  assert.equal(body.entries[0].filledCount, 0);
});
