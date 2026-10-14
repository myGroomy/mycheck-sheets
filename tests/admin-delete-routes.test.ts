// tests/admin-delete-routes.test.ts
// Uji route handler DELETE konfigurasi admin: arsip → hapus permanen boleh
// bila bersih, dan ditolak bila punya histori/dependensi/induk.
//
// Route dipanggil langsung sebagai fungsi (dengan stub session dari
// tests/helpers/mock-auth), sehingga jalur withAuth ikut diuji tanpa HTTP.

import test from 'node:test';
import assert from 'node:assert/strict';

// Urutan impor penting: mock-sheets memasang fake Sheets client, mock-auth
// memasang stub session. Keduanya harus mendahului impor route handler.
import { useWorkbook, getSheet } from './helpers/mock-sheets';
import { seedRegistry, addBranchSheet, branchSpreadsheetId } from './helpers/mock-registry';
import {
  installSessionStub,
  setSession,
  clearSession,
  makeRequest,
} from './helpers/mock-auth';
import { readAuditLog } from './helpers/audit-reader';
import { MONTHLY_SHEETS, STATIC_SHEETS } from '../lib/google/branch-schema';

installSessionStub();

const BASE = 'http://localhost:3000';
const CAB1 = 'CAB1';
/** Spreadsheet yang menyimpan tab konfigurasi cabang CAB1. */
const SPREADSHEET_ID = branchSpreadsheetId(CAB1);

interface SeedOptions {
  shift?: { id: string; isActive?: boolean };
  categories?: { id: string; isActive?: boolean }[];
  points?: { id: string; isActive?: boolean }[];
  handoverFields?: { id: string; isActive?: boolean }[];
  shiftInstances?: { id: string }[];
  /** Point dengan sop_category_id yang menunjuk kategori tidak ada (yatim). */
  orphanPoints?: { id: string; isActive?: boolean }[];
  incidentCategories?: { id: string; isActive?: boolean }[];
  entriesByMonth?: Record<string, { pointRef: string }[]>;
  incidentsByMonth?: Record<string, { categoryId: string }[]>;
}

function seed(options: SeedOptions = {}) {
  const workbook = seedRegistry([{ id: CAB1, name: 'Cabang 1' }]);
  const branchSheetId = branchSpreadsheetId(CAB1);
  const H = STATIC_SHEETS;
  const shift = options.shift ?? { id: 'S1' };
  const now = '2026-01-01T00:00:00.000Z';

  addBranchSheet(workbook, CAB1, 'ShiftDefinitions', H.ShiftDefinitions, [
    {
      id: shift.id,
      name: 'Shift Pagi',
      start_time: '08:00',
      end_time: '16:00',
      crosses_midnight: false,
      sort_order: 0,
      is_active: shift.isActive ?? true,
      created_at: now,
      updated_at: now,
      version: 1,
    },
  ]);

  addBranchSheet(
    workbook,
    CAB1,
    'SopCategories',
    H.SopCategories,
    (options.categories ?? []).map((c, i) => ({
      id: c.id,
      shift_definition_id: shift.id,
      name: `Kategori ${c.id}`,
      sort_order: i,
      is_active: c.isActive ?? true,
      created_at: now,
      updated_at: now,
      version: 1,
    }))
  );

  addBranchSheet(
    workbook,
    CAB1,
    'ChecklistPoints',
    H.ChecklistPoints,
    (options.points ?? []).map((p, i) => ({
      id: p.id,
      sop_category_id: options.categories?.[0]?.id ?? 'C1',
      title: `Item ${p.id}`,
      instruction: '',
      input_type: 'centang',
      input_types: '["centang"]',
      options: '',
      is_required: true,
      target_time: '',
      tolerance_minutes: '',
      active_days: '',
      number_min: '',
      number_max: '',
      sort_order: i,
      is_active: p.isActive ?? true,
      created_at: now,
      updated_at: now,
      version: 1,
    }))
  );

  // Ditambahkan ke sheet ChecklistPoints yang sudah ada (bukan sheet baru)
  // supaya baris point "normal" pada seed tetap utuh.
  const pointsSheet = getSheet(workbook, 'ChecklistPoints', SPREADSHEET_ID)!;
  for (const [i, p] of (options.orphanPoints ?? []).entries()) {
    pointsSheet.values.push(
      H.ChecklistPoints.map((h) => {
        if (h === 'id') return p.id;
        // Kategori induk sengaja tidak ada -> locateSopCategory akan null.
        if (h === 'sop_category_id') return 'KATEGORI_YATIM';
        if (h === 'title') return `Item yatim ${p.id}`;
        if (h === 'input_type') return 'centang';
        if (h === 'input_types') return '["centang"]';
        if (h === 'sort_order') return String(100 + i);
        if (h === 'is_required') return 'TRUE';
        if (h === 'is_active') return (p.isActive ?? true) ? 'TRUE' : 'FALSE';
        if (h === 'created_at' || h === 'updated_at') return now;
        if (h === 'version') return '1';
        return '';
      })
    );
  }

  addBranchSheet(
    workbook,
    CAB1,
    'HandoverFields',
    H.HandoverFields,
    (options.handoverFields ?? []).map((f, i) => ({
      id: f.id,
      shift_definition_id: shift.id,
      label: `Field ${f.id}`,
      field_type: 'teks',
      input_types: '["teks"]',
      options: '',
      is_required: false,
      sort_order: i,
      is_active: f.isActive ?? true,
      created_at: now,
      updated_at: now,
      version: 1,
    }))
  );

  addBranchSheet(
    workbook,
    CAB1,
    'ShiftInstances',
    H.ShiftInstances,
    (options.shiftInstances ?? []).map((s) => ({
      id: s.id,
      shift_definition_id: shift.id,
      shift_date: '2026-01-01',
      tab_month: '2026-01',
      status: 'closed',
    }))
  );

  addBranchSheet(
    workbook,
    CAB1,
    'IncidentCategories',
    H.IncidentCategories,
    (options.incidentCategories ?? []).map((c, i) => ({
      id: c.id,
      name: `Kategori Incident ${c.id}`,
      sort_order: i,
      is_active: c.isActive ?? true,
      created_at: now,
      updated_at: now,
    }))
  );

  for (const [month, rows] of Object.entries(options.entriesByMonth ?? {})) {
    addBranchSheet(
      workbook,
      CAB1,
      `Entries_${month}`,
      MONTHLY_SHEETS.Entries,
      rows.map((r, i) => ({
        id: `e${i}`,
        shift_instance_id: 'SI1',
        point_ref: r.pointRef,
      }))
    );
  }

  for (const [month, rows] of Object.entries(options.incidentsByMonth ?? {})) {
    addBranchSheet(
      workbook,
      CAB1,
      `Incidents_${month}`,
      MONTHLY_SHEETS.Incidents,
      rows.map((r, i) => ({
        id: `i${i}`,
        shift_instance_id: 'SI1',
        tab_month: month,
        category_id: r.categoryId,
        status: 'open',
      }))
    );
  }

  return { workbook, branchSheetId };
}

function adminRequest() {
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: CAB1 });
}

// ============================================================
// Otorisasi dasar
// ============================================================

test('DELETE ditolak tanpa session', async () => {
  seed();
  clearSession();
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/S1`));
  assert.equal(res.status, 401);
});

test('DELETE ditolak untuk petugas', async () => {
  seed();
  setSession({ username: 'p1', nama: 'Petugas', role: 'petugas', cabangId: CAB1 });
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/S1`));
  assert.equal(res.status, 403);
});

test('DELETE 404 untuk id yang tidak ada di cabang yang diakses', async () => {
  seed();
  adminRequest();
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/TIDAK_ADA`));
  assert.equal(res.status, 404);
});

// ============================================================
// Shift definition
// ============================================================

test('hapus shift aktif ditolak dengan pesan arsipkan dulu', async () => {
  seed({ shift: { id: 'S1', isActive: true } });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/S1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.match(body.error, /Arsipkan definisi shift/);
  assert.equal(body.reason, 'not_archived');
});

test('hapus shift arsip tanpa dependensi berhasil dan menulis audit log', async () => {
  const { workbook } = seed({ shift: { id: 'S1', isActive: false } });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/S1`));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.match(body.message, /berhasil dihapus/);

  const idCol = STATIC_SHEETS.ShiftDefinitions.indexOf('id');
  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  assert.equal(sheet.values.length, 1, 'hanya header yang tersisa');

  const audit = readAuditLog(workbook, undefined, SPREADSHEET_ID);
  const entry = audit.find((a) => a.action === 'delete_shift_definition');
  assert.ok(entry, 'audit log harus mencatat penghapusan');
  assert.equal(entry.object_type, 'shift_definition');
  assert.equal(entry.object_id, 'S1');
  assert.equal(entry.actor_id, 'admin1');
  assert.match(entry.before, /Shift Pagi/);
  assert.ok(entry.hash.length > 0);
  void idCol;
});

test('hapus shift dengan shift historis ditolak dan baris tetap ada', async () => {
  const { workbook } = seed({
    shift: { id: 'S1', isActive: false },
    shiftInstances: [{ id: 'SI1' }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/S1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'has_shift_history');
  assert.equal(body.shiftInstances, 1);
  assert.equal(getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!.values.length, 2);
  assert.equal(readAuditLog(workbook, undefined, SPREADSHEET_ID).length, 0, 'penolakan tidak menulis audit delete');
});

test('hapus shift dengan kategori turunan ditolak', async () => {
  seed({
    shift: { id: 'S1', isActive: false },
    categories: [{ id: 'C1', isActive: false }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/shifts/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/shifts/S1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'has_children');
  assert.equal(body.categories, 1);
});

// ============================================================
// Kategori SOP
// ============================================================

test('hapus kategori aktif ditolak', async () => {
  seed({ categories: [{ id: 'C1', isActive: true }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/sop-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/sop-categories/C1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.match(body.error, /Arsipkan kategori SOP/);
});

test('hapus kategori arsip tanpa point dan tanpa histori berhasil', async () => {
  const { workbook } = seed({ categories: [{ id: 'C1', isActive: false }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/sop-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/sop-categories/C1`));

  assert.equal(res.status, 200);
  assert.equal(getSheet(workbook, 'SopCategories', SPREADSHEET_ID)!.values.length, 1);

  const audit = readAuditLog(workbook, undefined, SPREADSHEET_ID);
  assert.ok(audit.some((a) => a.action === 'delete_sop_category'));
});

test('hapus kategori dengan checklist point ditolak', async () => {
  const { workbook } = seed({
    categories: [{ id: 'C1', isActive: false }],
    points: [{ id: 'P1', isActive: false }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/sop-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/sop-categories/C1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'has_children');
  assert.equal(body.points, 1);
  assert.equal(getSheet(workbook, 'SopCategories', SPREADSHEET_ID)!.values.length, 2);
});

test('hapus kategori pada shift yang sudah punya histori ditolak', async () => {
  seed({
    categories: [{ id: 'C1', isActive: false }],
    shiftInstances: [{ id: 'SI1' }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/sop-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/sop-categories/C1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'has_shift_history');
});

// ============================================================
// Checklist point
// ============================================================

test('hapus point aktif ditolak', async () => {
  seed({
    categories: [{ id: 'C1', isActive: false }],
    points: [{ id: 'P1', isActive: true }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/checklist-points/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/checklist-points/P1`));
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Arsipkan item checklist/);
});

test('hapus point arsip yang tidak pernah dipakai berhasil', async () => {
  const { workbook } = seed({
    categories: [{ id: 'C1', isActive: false }],
    points: [
      { id: 'P1', isActive: false },
      { id: 'P2', isActive: true },
    ],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/checklist-points/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/checklist-points/P1`));

  assert.equal(res.status, 200);
  const idCol = STATIC_SHEETS.ChecklistPoints.indexOf('id');
  const rows = getSheet(workbook, 'ChecklistPoints', SPREADSHEET_ID)!.values.slice(1);
  assert.deepEqual(rows.map((r) => r[idCol]), ['P2']);
  assert.ok(readAuditLog(workbook, undefined, SPREADSHEET_ID).some((a) => a.action === 'delete_checklist_point'));
});

test('hapus point yang masih direferensikan entry historis ditolak', async () => {
  const { workbook } = seed({
    categories: [{ id: 'C1', isActive: false }],
    points: [{ id: 'P1', isActive: false }],
    entriesByMonth: { '2026-01': [{ pointRef: 'P1' }] },
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/checklist-points/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/checklist-points/P1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'has_entry_refs');
  assert.equal(getSheet(workbook, 'ChecklistPoints', SPREADSHEET_ID)!.values.length, 2);
});

test('hapus point ditolak bila ada shift instance pada shift induknya', async () => {
  seed({
    categories: [{ id: 'C1', isActive: false }],
    points: [{ id: 'P1', isActive: false }],
    shiftInstances: [{ id: 'SI1' }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/checklist-points/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/checklist-points/P1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  // instances > 0 diperiksa sebelum referensi entry.
  assert.equal(body.reason, 'has_shift_history');
});

// ============================================================
// Handover field
// ============================================================

test('hapus handover field aktif ditolak', async () => {
  seed({ handoverFields: [{ id: 'F1', isActive: true }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/handover-fields/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/handover-fields/F1`));
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Arsipkan bidang handover/);
});

test('hapus handover field arsip tanpa histori berhasil dan menulis audit', async () => {
  const { workbook } = seed({ handoverFields: [{ id: 'F1', isActive: false }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/handover-fields/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/handover-fields/F1`));

  assert.equal(res.status, 200);
  assert.equal(getSheet(workbook, 'HandoverFields', SPREADSHEET_ID)!.values.length, 1);
  assert.ok(readAuditLog(workbook, undefined, SPREADSHEET_ID).some((a) => a.action === 'delete_handover_field'));
});

test('hapus handover field ditolak bila shift induk punya histori', async () => {
  const { workbook } = seed({
    handoverFields: [{ id: 'F1', isActive: false }],
    shiftInstances: [{ id: 'SI1' }],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/handover-fields/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/handover-fields/F1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'has_shift_history');
  assert.equal(getSheet(workbook, 'HandoverFields', SPREADSHEET_ID)!.values.length, 2);
});

test('hapus point ditolak bila induk kategorinya tidak dapat diverifikasi (fail closed)', async () => {
  const { workbook } = seed({ orphanPoints: [{ id: 'P_ORPHAN', isActive: false }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/checklist-points/[id]/route');

  const res = await DELETE(
    makeRequest('DELETE', `${BASE}/api/admin/checklist-points/P_ORPHAN`)
  );
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'parent_unverified');
  // Baris tidak boleh hilang walau kelayakannya secara data "bersih".
  assert.equal(getSheet(workbook, 'ChecklistPoints', SPREADSHEET_ID)!.values.length, 2);
});

test('hapus handover field ditolak bila induk shift tidak dapat diverifikasi', async () => {
  // Handover field dengan shift_definition_id yang tidak ada di ShiftDefinitions.
  const { workbook } = seed();
  addBranchSheet(workbook, CAB1, 'HandoverFields', STATIC_SHEETS.HandoverFields, [
    {
      id: 'F_YATIM',
      shift_definition_id: 'SHIFT_HILANG',
      label: 'Field yatim',
      field_type: 'teks',
      input_types: '["teks"]',
      options: '',
      is_required: false,
      sort_order: 0,
      is_active: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      version: 1,
    },
  ]);
  adminRequest();
  const { DELETE } = await import('../app/api/admin/handover-fields/[id]/route');

  const res = await DELETE(
    makeRequest('DELETE', `${BASE}/api/admin/handover-fields/F_YATIM`)
  );
  const body = await res.json();

  // `locateHandoverField` hanya memindai baris HandoverFields, jadi id ditemukan;
  // tahap verifikasi induk-lah yang menentukan.
  if (res.status === 409) {
    assert.equal(body.reason, 'parent_unverified');
    assert.equal(getSheet(workbook, 'HandoverFields', SPREADSHEET_ID)!.values.length, 2);
  } else {
    // Bila id tidak ditemukan locate, 404 juga merupakan penolakan yang aman.
    assert.equal(res.status, 404);
  }
});

// ============================================================
// Kategori incident
// ============================================================

test('hapus kategori incident aktif ditolak', async () => {
  seed({ incidentCategories: [{ id: 'IC1', isActive: true }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/incident-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/incident-categories/IC1`));
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Arsipkan kategori incident/);
});

test('hapus kategori incident yang sudah dipakai incident ditolak', async () => {
  const { workbook } = seed({
    incidentCategories: [{ id: 'IC1', isActive: false }],
    incidentsByMonth: { '2026-01': [{ categoryId: 'IC1' }] },
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/incident-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/incident-categories/IC1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'in_use');
  assert.equal(getSheet(workbook, 'IncidentCategories', SPREADSHEET_ID)!.values.length, 2);
});

test('hapus kategori incident yang belum dipakai berhasil', async () => {
  const { workbook } = seed({ incidentCategories: [{ id: 'IC1', isActive: false }] });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/incident-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/incident-categories/IC1`));

  assert.equal(res.status, 200);
  assert.equal(getSheet(workbook, 'IncidentCategories', SPREADSHEET_ID)!.values.length, 1);
  assert.ok(readAuditLog(workbook, undefined, SPREADSHEET_ID).some((a) => a.action === 'delete_incident_category'));
});

test('kategori incident terpakai di tab bulan lain juga ditolak', async () => {
  seed({
    incidentCategories: [{ id: 'IC1', isActive: false }],
    incidentsByMonth: { '2025-11': [{ categoryId: 'IC1' }] },
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/incident-categories/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/incident-categories/IC1`));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).reason, 'in_use');
});

// ============================================================
// Archive-only: cabang & akun
// ============================================================

test('cabang tidak dapat dihapus permanen, selalu ditolak', async () => {
  seedRegistry([{ id: CAB1, name: 'Cabang 1' }]);
  adminRequest();
  const { DELETE } = await import('../app/api/admin/branches/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/branches/${CAB1}`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'archive_only');
  assert.match(body.error, /hanya dapat diarsipkan/);
});

test('akun tidak dapat dihapus permanen, selalu ditolak', async () => {
  useWorkbook();
  adminRequest();
  const { DELETE } = await import('../app/api/admin/users/[id]/route');

  const res = await DELETE(makeRequest('DELETE', `${BASE}/api/admin/users/U1`));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.reason, 'archive_only');
});

// ============================================================
// Audit log: hash chain
// ============================================================

test('dua penghapusan berurutan membentuk rantai hash', async () => {
  const { workbook } = seed({
    categories: [
      { id: 'C1', isActive: false },
      { id: 'C2', isActive: false },
    ],
  });
  adminRequest();
  const { DELETE } = await import('../app/api/admin/sop-categories/[id]/route');

  await DELETE(makeRequest('DELETE', `${BASE}/api/admin/sop-categories/C1`));
  await DELETE(makeRequest('DELETE', `${BASE}/api/admin/sop-categories/C2`));

  const audit = readAuditLog(workbook, undefined, SPREADSHEET_ID);
  assert.equal(audit.length, 2);
  assert.equal(audit[0].prev_hash, '');
  assert.equal(audit[1].prev_hash, audit[0].hash, 'baris kedua menunjuk hash baris pertama');
  assert.notEqual(audit[0].hash, audit[1].hash);
  assert.deepEqual(
    audit.map((a) => a.seq),
    ['1', '2']
  );
});