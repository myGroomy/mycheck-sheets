// tests/working-branch.test.ts
// Uji Phase 1 — konteks "cabang kerja" untuk admin.
//
// Inti yang diuji: TIDAK ADA lagi fallback diam-diam ke `ctx.branchIds[0]`.
// Sebelum Phase 1, admin yang membuat incident di luar shift akan masuk ke
// cabang PERTAMA secara alfabetis karena `branchId` tidak pernah dikirim dari
// form. Sekarang admin tanpa `branchId` ditolak dengan 400.
//
// Yang TIDAK berubah dan harus tetap lulus: petugas tetap boleh tanpa
// branchId, dan admin tetap boleh MEMBACA semua cabang.

import test from 'node:test';
import assert from 'node:assert/strict';

import { seedRegistry, addBranchSheet, resetRegistryCache, branchSpreadsheetId } from './helpers/mock-registry';
import { installSessionStub, setSession, clearSession, makeRequest } from './helpers/mock-auth';
import { getSheet } from './helpers/fake-sheets';
import { MONTHLY_SHEETS, STATIC_SHEETS, monthlySheet } from '../lib/google/branch-schema';

installSessionStub();

const BASE = 'http://localhost:3000';
const CAB1 = 'CAB1';
const CAB2 = 'CAB2';
const TAB_MONTH = '2026-10';

// Admin sengaja diberi akses ke DUA cabang supaya cabut-butuhnya terlihat:
// CAB1 adalah cabang pertama secara alfabetis, yaitu tepat cabang yang akan
// dipakai implementasi lama (`ctx.branchIds[0]`) saat branchId tidak dikirim.
function seedTwoBranches() {
  const workbook = seedRegistry([
    { id: CAB1, name: 'Cabang Satu' },
    { id: CAB2, name: 'Cabang Dua' },
  ]);

  for (const branchId of [CAB1, CAB2]) {
    addBranchSheet(workbook, branchId, 'IncidentCategories', STATIC_SHEETS.IncidentCategories, [
      { id: 'CAT1', name: 'Peralatan Rusak', sort_order: 0, is_active: true, created_at: '', updated_at: '' },
    ]);
    addBranchSheet(workbook, branchId, 'IncidentIndex', STATIC_SHEETS.IncidentIndex);
    addBranchSheet(workbook, branchId, 'AuditLog', MONTHLY_SHEETS.AuditLog);
    addBranchSheet(workbook, branchId, '_meta', STATIC_SHEETS._meta);
    // Tab bulanan harus dibuat eksplisit: `ensureIncidentTabs` memakai
    // ensureSheet yang tidak diimplementasikan fake Sheets client.
    addBranchSheet(workbook, branchId, monthlySheet('Incidents', TAB_MONTH), MONTHLY_SHEETS.Incidents);
    addBranchSheet(workbook, branchId, monthlySheet('IncidentNotes', TAB_MONTH), MONTHLY_SHEETS.IncidentNotes);
  }

  resetRegistryCache();
  return workbook;
}

function incidentBody(extra: Record<string, unknown> = {}) {
  return {
    categoryId: 'CAT1',
    description: 'Kran service bocor di area kasir',
    occurredAt: '2026-10-10T08:00:00.000Z',
    outsideShift: true,
    ...extra,
  };
}

/** Baris data (tanpa header) pada tab Incidents bulanan sebuah cabang. */
function incidentRows(
  workbook: ReturnType<typeof seedTwoBranches>,
  branchId: string
): Record<string, string>[] {
  const sheet = getSheet(workbook, monthlySheet('Incidents', TAB_MONTH), branchSpreadsheetId(branchId));
  if (!sheet) return [];
  const headers = MONTHLY_SHEETS.Incidents;
  return sheet.values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = String(row[index] ?? '');
    });
    return obj;
  });
}

async function postIncident(body: unknown) {
  const { POST } = await import('../app/api/incidents/route');
  const res = await POST(makeRequest('POST', `${BASE}/api/incidents`, body));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// POST /api/incidents
// ---------------------------------------------------------------------------

test('admin membuat incident di luar shift tanpa branchId → 400, bukan cabang fallback', async () => {
  seedTwoBranches();
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });

  const { status, json } = await postIncident(incidentBody());
  clearSession();

  assert.equal(status, 400);
  assert.match(String(json.error), /cabang kerja/i);
});

test('admin dengan branchId → incident masuk ke spreadsheet cabang itu', async () => {
  const workbook = seedTwoBranches();
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });

  const { status, json } = await postIncident(incidentBody({ branchId: CAB2 }));
  clearSession();

  assert.equal(status, 200);
  assert.ok(json.incident_id, 'incident_id harus dikembalikan');

  // Cabang yang TIDAK dipilih harus tetap kosong — ini inti dari perbaikan.
  assert.equal(incidentRows(workbook, CAB1).length, 0, 'incident tidak boleh bocor ke CAB1');
  const written = incidentRows(workbook, CAB2);
  assert.equal(written.length, 1);
  assert.equal(written[0]['description'], 'Kran service bocor di area kasir');
});

test('petugas tanpa branchId tetap boleh membuat incident (branchIds[0] = cabangnya)', async () => {
  const workbook = seedTwoBranches();
  setSession({ username: 'petugas1', nama: 'Petugas Uji', role: 'petugas', cabangId: CAB2 });

  const { status } = await postIncident(incidentBody());
  clearSession();

  assert.equal(status, 200);
  assert.equal(incidentRows(workbook, CAB2).length, 1);
  assert.equal(incidentRows(workbook, CAB1).length, 0);
});

test('petugas tidak bisa menulis ke cabang yang tidak ditugaskan', async () => {
  seedTwoBranches();
  setSession({ username: 'petugas1', nama: 'Petugas Uji', role: 'petugas', cabangId: CAB1 });

  const { status } = await postIncident(incidentBody({ branchId: CAB2 }));
  clearSession();

  assert.equal(status, 403);
});

test('incident yang terhubung shift tetap mengikuti cabang shift, bukan branchId body', async () => {
  // Regression guard: bila shiftInstanceId ada, cabang HARUS berasal dari
  // shift. branchId di body tidak boleh menimpa.
  seedTwoBranches();
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });

  const { status } = await postIncident(
    incidentBody({ branchId: CAB2, shiftInstanceId: 'SI_TIDAK_ADA' })
  );
  clearSession();

  // Shift tidak ditemukan → ditolak sebelum cabang apa pun dipakai.
  assert.equal(status, 404);
});

// ---------------------------------------------------------------------------
// POST /api/shifts/open
// ---------------------------------------------------------------------------

function seedShiftDefinition(workbook: ReturnType<typeof seedTwoBranches>, branchId: string, definitionId: string) {
  addBranchSheet(
    workbook,
    branchId,
    'ShiftDefinitions',
    STATIC_SHEETS.ShiftDefinitions,
    [{ id: definitionId, name: 'Shift Pagi', start_time: '08:00', end_time: '16:00', crosses_midnight: false, sort_order: 0, is_active: true, created_at: '', updated_at: '', version: 1 }]
  );
  addBranchSheet(workbook, branchId, 'ShiftInstances', STATIC_SHEETS.ShiftInstances);
  addBranchSheet(workbook, branchId, 'Participants', STATIC_SHEETS.Participants);
  addBranchSheet(workbook, branchId, 'AuditLog', MONTHLY_SHEETS.AuditLog);
  // Snapshot shift membaca seluruh template cabang.
  addBranchSheet(workbook, branchId, 'SopCategories', STATIC_SHEETS.SopCategories);
  addBranchSheet(workbook, branchId, 'ChecklistPoints', STATIC_SHEETS.ChecklistPoints);
  addBranchSheet(workbook, branchId, 'HandoverFields', STATIC_SHEETS.HandoverFields);
  addBranchSheet(workbook, branchId, '_meta', STATIC_SHEETS._meta);
}

async function postOpenShift(body: unknown) {
  const { POST } = await import('../app/api/shifts/open/route');
  const res = await POST(makeRequest('POST', `${BASE}/api/shifts/open`, body));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

test('admin membuka shift tanpa branchId → 400', async () => {
  const workbook = seedTwoBranches();
  seedShiftDefinition(workbook, CAB1, 'DEF1');
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });

  const { status, json } = await postOpenShift({ shiftDefinitionId: 'DEF1' });
  clearSession();

  assert.equal(status, 400);
  assert.match(String(json.error), /cabang kerja/i);
});

test('admin membuka shift di cabang kerja yang benar → berhasil', async () => {
  const workbook = seedTwoBranches();
  seedShiftDefinition(workbook, CAB2, 'DEF2');
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });

  const { status } = await postOpenShift({ shiftDefinitionId: 'DEF2', branchId: CAB2 });
  clearSession();

  assert.equal(status, 200);
});

test('admin tidak bisa membuka shift definisi cabang lain lewat branchId working', async () => {
  // DEF2 hanya ada di CAB2. Kalau admin mengclaimer CAB1, definisi tidak boleh
  // dicari di CAB2 lalu diam-diam dibuka di sana.
  const workbook = seedTwoBranches();
  seedShiftDefinition(workbook, CAB2, 'DEF2');
  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });

  const { status } = await postOpenShift({ shiftDefinitionId: 'DEF2', branchId: CAB1 });
  clearSession();

  assert.equal(status, 404);
});

test('petugas membuka shift tanpa branchId tetap boleh', async () => {
  const workbook = seedTwoBranches();
  seedShiftDefinition(workbook, CAB1, 'DEF1');
  setSession({ username: 'petugas1', nama: 'Petugas Uji', role: 'petugas', cabangId: CAB1 });

  const { status } = await postOpenShift({ shiftDefinitionId: 'DEF1' });
  clearSession();

  assert.equal(status, 200);
});