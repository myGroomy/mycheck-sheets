// tests/handover-prev.test.ts
// Uji `GET /api/shifts/[id]/handover-prev`: resolusi field handover dari
// snapshot shift SEBELUMNYA (bukan template shift berjalan), incident open,
// status "sudah dibaca", dan guard akses cabang.

import test from 'node:test';
import assert from 'node:assert/strict';

// Urutan impor penting: mock-sheets dulu (fake client), lalu mock-auth (stub
// session), baru helper lain.
import { getSheet } from './helpers/mock-sheets';
import {
  seedRegistry,
  addBranchSheet,
  branchSpreadsheetId,
  BRANCH_SPREADSHEET_PREFIX,
} from './helpers/mock-registry';
import { installSessionStub, setSession, clearSession, makeRequest } from './helpers/mock-auth';
import { MONTHLY_SHEETS, STATIC_SHEETS } from '../lib/google/branch-schema';

installSessionStub();

const BASE = 'http://localhost:3000';
const CAB1 = 'CAB1';
const CAB2 = 'CAB2';

interface HandoverSeed {
  /** Template milik shift sebelumnya; dipakai untuk me-resolve label. */
  previousFields?: {
    id: string;
    label: string;
    field_type: string;
    input_types?: string[];
  }[];
  handoverValues?: Record<string, unknown> | string;
  handoverFreeText?: string;
  handoverSubmittedAt?: string;
  handoverSubmittedBy?: string;
  /** Nilai extra yang tidak ada di snapshot (field dihapus admin). */
  currentFields?: { id: string; label: string }[];
  openIncidents?: { id: string; categoryId?: string; description?: string; severity?: string }[];
  closedIncidents?: { id: string }[];
  acks?: { handoverId: string; userId: string; readingShift?: string }[];
  /** Shift lain yang tertutup DAN dibuka setelah shift sebelumnya. */
  newerClosedShift?: boolean;
  user?: string;
  branch?: string;
}

function handoverId(): string {
  return 'HO-1';
}

function seed(options: HandoverSeed = {}) {
  const workbook = seedRegistry([
    { id: CAB1, name: 'Cabang 1' },
    { id: CAB2, name: 'Cabang 2' },
  ]);

  const prevSnapshot = {
    v: 1,
    shift: {
      id: 'S1',
      name: 'Shift Pagi',
      start_time: '08:00',
      end_time: '16:00',
      crosses_midnight: false,
    },
    settings: { tolerance_default_minutes: 15, timezone: 'Asia/Jakarta' },
    categories: [],
    handover_fields: (options.previousFields ?? []).map((f, i) => ({
      id: f.id,
      label: f.label,
      field_type: f.field_type,
      input_types: f.input_types ?? [f.field_type],
      options: null,
      is_required: i === 0,
      sort_order: i,
    })),
  };

  const currentSnapshot = {
    ...prevSnapshot,
    shift: { id: 'S1', name: 'Shift Pagi (template baru)', start_time: '08:00', end_time: '16:00', crosses_midnight: false },
    handover_fields: (options.currentFields ?? []).map((f, i) => ({
      id: f.id,
      label: f.label,
      field_type: 'teks',
      input_types: ['teks'],
      options: null,
      is_required: false,
      sort_order: i,
    })),
  };

  addBranchSheet(workbook, CAB1, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [
    { id: 'S1', name: 'Shift Pagi', start_time: '08:00', end_time: '16:00', is_active: true },
  ]);

  const instances = [
    {
      id: 'SI_PREV',
      shift_definition_id: 'S1',
      shift_date: '2026-10-03',
      tab_month: '2026-10',
      status: 'ditutup',
      pj_user_id: 'petugas_lama',
      opened_at: '2026-10-03T00:00:00.000Z',
      closed_at: '2026-10-03T16:30:00.000Z',
      template_snapshot: JSON.stringify(prevSnapshot),
    },
    {
      id: 'SI_CURRENT',
      shift_definition_id: 'S1',
      shift_date: '2026-10-04',
      tab_month: '2026-10',
      status: 'berjalan',
      pj_user_id: 'petugas1',
      opened_at: '2026-10-04T00:00:00.000Z',
      template_snapshot: JSON.stringify(currentSnapshot),
    },
  ];

  if (options.newerClosedShift) {
    instances.splice(1, 0, {
      id: 'SI_MIDDLE',
      shift_definition_id: 'S1',
      shift_date: '2026-10-02',
      tab_month: '2026-10',
      status: 'ditutup_paksa',
      pj_user_id: 'petugas_lama',
      opened_at: '2026-10-02T00:00:00.000Z',
      closed_at: '2026-10-02T16:00:00.000Z',
      template_snapshot: JSON.stringify(prevSnapshot),
    });
  }

  addBranchSheet(workbook, CAB1, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, instances);

  // Handover untuk shift sebelumnya (dan shift tengah bila ada).
  const handoverRows = [
    {
      id: handoverId(),
      shift_instance_id: 'SI_PREV',
      values:
        typeof options.handoverValues === 'string'
          ? options.handoverValues
          : JSON.stringify(options.handoverValues ?? {}),
      free_text: options.handoverFreeText ?? '',
      photo_ids: '[]',
      submitted_by: options.handoverSubmittedBy ?? 'petugas_lama',
      submitted_at: options.handoverSubmittedAt ?? '2026-10-03T16:20:00.000Z',
    },
  ];
  if (options.newerClosedShift) {
    handoverRows.push({
      id: 'HO-MIDDLE',
      shift_instance_id: 'SI_MIDDLE',
      values: JSON.stringify({}),
      free_text: 'dari shift tengah',
      photo_ids: '[]',
      submitted_by: 'petugas_lama',
      submitted_at: '2026-10-02T15:00:00.000Z',
    });
  }
  addBranchSheet(workbook, CAB1, 'Handovers_2026-10', MONTHLY_SHEETS.Handovers, handoverRows);

  addBranchSheet(
    workbook,
    CAB1,
    'IncidentIndex',
    STATIC_SHEETS.IncidentIndex,
    [
      ...(options.openIncidents ?? []).map((i) => ({
        incident_id: i.id,
        tab_month: '2026-10',
        status: 'open',
        category_id: i.categoryId ?? '',
        reported_at: '2026-10-04T08:00:00.000Z',
        is_test: 'FALSE',
      })),
      ...(options.closedIncidents ?? []).map((i) => ({
        incident_id: i.id,
        tab_month: '2026-10',
        status: 'selesai',
        category_id: '',
        reported_at: '2026-10-01T08:00:00.000Z',
        is_test: 'FALSE',
      })),
    ]
  );

  addBranchSheet(
    workbook,
    CAB1,
    'Incidents_2026-10',
    MONTHLY_SHEETS.Incidents,
    [
      ...(options.openIncidents ?? []).map((i) => ({
        id: i.id,
        category_id: i.categoryId ?? '',
        description: i.description ?? 'Inciden terbuka',
        reported_at: '2026-10-04T08:00:00.000Z',
        status: 'open',
        severity: i.severity ?? 'normal',
        is_test: 'FALSE',
      })),
      ...(options.closedIncidents ?? []).map((i) => ({
        id: i.id,
        category_id: '',
        description: 'Inciden selesai',
        reported_at: '2026-10-01T08:00:00.000Z',
        status: 'selesai',
        severity: 'normal',
        is_test: 'FALSE',
      })),
    ]
  );

  addBranchSheet(
    workbook,
    CAB1,
    'IncidentCategories',
    STATIC_SHEETS.IncidentCategories,
    [{ id: 'CAT1', name: 'Peralatan', sort_order: 0, is_active: true }]
  );

  if (options.acks?.length) {
    addBranchSheet(
      workbook,
      CAB1,
      'HandoverAcks_2026-10',
      MONTHLY_SHEETS.HandoverAcks,
      options.acks.map((a, i) => ({
        id: `ACK-${i}`,
        handover_id: a.handoverId,
        reading_shift_instance_id: a.readingShift ?? 'SI_CURRENT',
        user_id: a.userId,
        read_at: '2026-10-04T09:00:00.000Z',
      }))
    );
  }

  return { workbook, branchSheetId: `${BRANCH_SPREADSHEET_PREFIX}${CAB1}` };
}

function asPetugas(user = 'petugas1', branch = CAB1) {
  setSession({ username: user, nama: user, role: 'petugas', cabangId: branch });
}

async function callGet(shiftId = 'SI_CURRENT') {
  const { GET } = await import('../app/api/shifts/[id]/handover-prev/route');
  return GET(makeRequest('GET', `${BASE}/api/shifts/${shiftId}/handover-prev`));
}

// ============================================================
// Guard
// ============================================================

test('401 tanpa session', async () => {
  seed();
  clearSession();
  const res = await callGet();
  assert.equal(res.status, 401);
});

test('404 untuk shift yang tidak ada', async () => {
  seed();
  asPetugas();
  const res = await callGet('TIDAK_ADA');
  assert.equal(res.status, 404);
});

test('petugas tanpa akses ke cabang shift tidak dapat membacanya', async () => {
  seed();
  // Session hanya berisi CAB2, sedangkan shift berada di CAB1.
  // `resolveInstance` sudah mempersempit pencarian ke ctx.branchIds, jadi
  // jawabannya 404 — bukan 403. Itu benar: membocorkan 403 akan mengonfirmasi
  // keberadaan shift di cabang yang tidak boleh diakses.
  asPetugas('petugas1', CAB2);
  const res = await callGet();
  assert.equal(res.status, 404);
});

test('admin boleh membaca handover cabang mana pun', async () => {
  seed();
  setSession({ username: 'admin1', nama: 'Admin', role: 'admin', cabangId: '' });
  const res = await callGet();
  assert.equal(res.status, 200);
});

// ============================================================
// Shift sebelumnya
// ============================================================

test('mengembalikan null bila belum ada shift tertutup sebelumnya', async () => {
  const workbook = seedRegistry([
    { id: CAB1, name: 'Cabang 1' },
    { id: CAB2, name: 'Cabang 2' },
  ]);
  addBranchSheet(workbook, CAB1, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, [
    {
      id: 'SI_CURRENT',
      shift_definition_id: 'S1',
      shift_date: '2026-10-04',
      tab_month: '2026-10',
      status: 'berjalan',
      opened_at: '2026-10-04T00:00:00.000Z',
    },
  ]);
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.previousShift, null);
  assert.equal(body.handover, null);
  assert.deepEqual(body.openIncidents, []);
});

test('memilih shift tertutup terbaru, bukan yang paling lama', async () => {
  seed({ newerClosedShift: true });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.previousShift.shiftInstanceId, 'SI_PREV');
  assert.equal(body.handover.id, handoverId());
});

test('mengabaikan shift yang masih berjalan', async () => {
  seed();
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.equal(body.previousShift.shiftInstanceId, 'SI_PREV');
});

// ============================================================
// Resolusi field dari snapshot shift sebelumnya
// ============================================================

test('label field diambil dari snapshot shift sebelumnya, bukan template sekarang', async () => {
  seed({
    previousFields: [{ id: 'F1', label: 'Kas Akhir', field_type: 'angka' }],
    // Template shift berjalan memakai id & label berbeda untuk field yang sama.
    currentFields: [{ id: 'F1', label: 'Saldo (label baru)' }],
    handoverValues: { F1: 2450000 },
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.handover.fields.length, 1);
  assert.equal(body.handover.fields[0].label, 'Kas Akhir');
  assert.equal(body.handover.fields[0].display, '2450000');
});

test('nilai array dan jamak tipe diformat untuk tampilan', async () => {
  seed({
    previousFields: [
      { id: 'F_LIST', label: 'Menu Terlaris', field_type: 'kotak_centang' },
      { id: 'F_MULTI', label: 'Status', field_type: 'teks', input_types: ['teks', 'angka'] },
    ],
    handoverValues: { F_LIST: ['Nasi goreng', 'Kopi'], F_MULTI: { teks: 'Lancar', angka: 42 } },
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  const byLabel = Object.fromEntries(
    body.handover.fields.map((f: { label: string; display: string }) => [f.label, f.display])
  );
  assert.equal(byLabel['Menu Terlaris'], 'Nasi goreng, Kopi');
  assert.match(byLabel['Status'], /Teks: Lancar/);
  assert.match(byLabel['Status'], /Angka: 42/);
});

test('field foto menampilkan jumlah lampiran, bukan daftar id', async () => {
  seed({
    previousFields: [{ id: 'F_PHOTO', label: 'Foto condition', field_type: 'foto' }],
    handoverValues: { F_PHOTO: ['p1', 'p2', 'p3'] },
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.handover.fields[0].display, '3 foto terlampir');
  assert.equal(body.handover.fields[0].hasPhoto, true);
});

test('field kosong menampilkan "—"', async () => {
  seed({
    previousFields: [{ id: 'F1', label: 'Kas Akhir', field_type: 'angka' }],
    handoverValues: { F1: '' },
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.equal(body.handover.fields[0].display, '—');
});

test('nilai tanpa field di snapshot tetap ditampilkan dengan penanda', async () => {
  seed({
    previousFields: [{ id: 'F1', label: 'Kas Akhir', field_type: 'angka' }],
    handoverValues: { F1: 100, F_LAMA: 'catatan lama' },
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  const orphan = body.handover.fields.find(
    (f: { id: string }) => f.id === 'F_LAMA'
  );
  assert.ok(orphan, 'nilai orphan tidak boleh hilang');
  assert.match(orphan.label, /sudah dihapus dari template/);
  assert.equal(orphan.display, 'catatan lama');
});

test('values yang rusak tidak menggagalkan respons', async () => {
  seed({
    previousFields: [{ id: 'F1', label: 'Kas', field_type: 'angka' }],
    handoverValues: '{bukan json',
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.handover.fields[0].display, '—');
});

test('snapshot rusak tidak menggagalkan respons', async () => {
  const { workbook } = seed({ handoverValues: { F1: 1 } });
  const sheet = getSheet(workbook, 'ShiftInstances', branchSpreadsheetId(CAB1))!;
  const snapshotCol = STATIC_SHEETS.ShiftInstances.indexOf('template_snapshot');
  sheet.values[1][snapshotCol] = '{rusak';

  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.previousShift.shiftInstanceId, 'SI_PREV');
});

test('handover null bila shift sebelumnya ditutup tanpa handover', async () => {
  const workbook = seedRegistry([
    { id: CAB1, name: 'Cabang 1' },
    { id: CAB2, name: 'Cabang 2' },
  ]);
  addBranchSheet(workbook, CAB1, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, [
    {
      id: 'SI_PREV',
      shift_definition_id: 'S1',
      shift_date: '2026-10-03',
      tab_month: '2026-10',
      status: 'ditutup_paksa',
      opened_at: '2026-10-03T00:00:00.000Z',
      template_snapshot: '{}',
    },
    {
      id: 'SI_CURRENT',
      shift_definition_id: 'S1',
      shift_date: '2026-10-04',
      tab_month: '2026-10',
      status: 'berjalan',
      opened_at: '2026-10-04T00:00:00.000Z',
      template_snapshot: '{}',
    },
  ]);
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.handover, null);
  assert.equal(body.previousShift.status, 'ditutup_paksa');
});

// ============================================================
// Incident open
// ============================================================

test('incident open ditampilkan bersama nama kategori', async () => {
  seed({
    openIncidents: [
      { id: 'INC1', categoryId: 'CAT1', description: 'Freezer tidak dingin', severity: 'tinggi' },
    ],
    closedIncidents: [{ id: 'INC2' }],
  });
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.openIncidents.length, 1);
  assert.equal(body.openIncidents[0].description, 'Freezer tidak dingin');
  assert.equal(body.openIncidents[0].categoryName, 'Peralatan');
  assert.equal(body.openIncidents[0].severity, 'tinggi');
});

test('incident selesai tidak ikut ditampilkan', async () => {
  seed({ closedIncidents: [{ id: 'INC2' }, { id: 'INC3' }] });
  asPetugas();
  const res = await callGet();
  const body = await res.json();
  assert.deepEqual(body.openIncidents, []);
});

// ============================================================
// Sudah dibaca
// ============================================================

test('ack reporting null saat belum ada yang membaca', async () => {
  seed();
  asPetugas();
  const res = await callGet();
  const body = await res.json();

  assert.deepEqual(body.ack, { readAt: null, readByCount: 0, readByMe: false });
});

test('ack reporting benar untuk pengguna yang sudah membaca', async () => {
  seed({ acks: [{ handoverId: handoverId(), userId: 'petugas1' }] });
  asPetugas('petugas1');
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.ack.readByMe, true);
  assert.equal(body.ack.readByCount, 1);
  assert.ok(body.ack.readAt);
});

test('ack milik orang lain tidak menandai pengguna ini sudah membaca', async () => {
  seed({ acks: [{ handoverId: handoverId(), userId: 'petugas_lain' }] });
  asPetugas('petugas1');
  const res = await callGet();
  const body = await res.json();

  assert.equal(body.ack.readByMe, false);
  assert.equal(body.ack.readByCount, 1);
});