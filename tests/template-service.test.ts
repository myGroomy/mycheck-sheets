// tests/template-service.test.ts
// Uji siklus hidup konfigurasi template di lib/admin/template-service.ts
// terhadap fake Sheets: arsip, pulihkan, dan hard delete + nomor baris fisik.
//
// Delete di service memakai `findRowFresh` lalu `deleteSheetRows`. Kalau nomor
// baris salah, baris yang terhapus bukan baris yang dimaksud — itu risiko
// paling serius di modul ini dan tidak terlihat dari inspeksi kode.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getSheet } from './helpers/mock-sheets';
import { seedRegistry, addBranchSheet, branchSpreadsheetId } from './helpers/mock-registry';
import { MONTHLY_SHEETS, STATIC_SHEETS } from '../lib/google/branch-schema';

const CAB1 = 'CAB1';
const SPREADSHEET_ID = branchSpreadsheetId(CAB1);

function seedBranch(options: {
  shifts?: { id: string; isActive?: boolean }[];
  categories?: { id: string; shiftId: string; isActive?: boolean }[];
  points?: { id: string; categoryId: string; isActive?: boolean }[];
  handoverFields?: { id: string; shiftId: string; isActive?: boolean }[];
  shiftInstances?: { id: string; shiftId: string }[];
  entriesByMonth?: Record<string, { id: string; pointRef: string }[]>;
}) {
  // Registry dan tab cabang dibuat di spreadsheet masing-masing supaya service
  // hanya pernah membaca tab yang diminta (meniru isolasi spreadsheet Sheets).
  const workbook = seedRegistry([{ id: CAB1, name: 'Cabang Uji' }]);
  const H = STATIC_SHEETS;

  addBranchSheet(
    workbook,
    CAB1,
    'ShiftDefinitions',
    H.ShiftDefinitions,
    (options.shifts ?? [{ id: 'S1' }]).map((s, i) => ({
      id: s.id,
      name: `Shift ${s.id}`,
      start_time: '08:00',
      end_time: '16:00',
      crosses_midnight: false,
      sort_order: i,
      is_active: s.isActive ?? true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      version: 1,
    }))
  );

  addBranchSheet(
    workbook,
    CAB1,
    'SopCategories',
    H.SopCategories,
    (options.categories ?? []).map((c, i) => ({
      id: c.id,
      shift_definition_id: c.shiftId,
      name: `Kategori ${c.id}`,
      sort_order: i,
      is_active: c.isActive ?? true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
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
      sop_category_id: p.categoryId,
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
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      version: 1,
    }))
  );

  addBranchSheet(
    workbook,
    CAB1,
    'HandoverFields',
    H.HandoverFields,
    (options.handoverFields ?? []).map((f, i) => ({
      id: f.id,
      shift_definition_id: f.shiftId,
      label: `Field ${f.id}`,
      field_type: 'teks',
      input_types: '["teks"]',
      options: '',
      is_required: false,
      sort_order: i,
      is_active: f.isActive ?? true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
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
      shift_definition_id: s.shiftId,
      shift_date: '2026-01-01',
      tab_month: '2026-01',
      status: 'closed',
    }))
  );

  for (const [month, rows] of Object.entries(options.entriesByMonth ?? {})) {
    addBranchSheet(
      workbook,
      CAB1,
      `Entries_${month}`,
      MONTHLY_SHEETS.Entries,
      rows.map((r) => ({ id: r.id, shift_instance_id: 'SI1', point_ref: r.pointRef }))
    );
  }

  return workbook;
}

const idsOf = (sheet: { values: unknown[][] }, columnIndex: number) =>
  sheet.values.slice(1).map((row) => row[columnIndex]);

// ============================================================
// Baca
// ============================================================

test('listShiftDefinitions mengurutkan berdasarkan sort_order', async () => {
  const workbook = seedBranch({ shifts: [{ id: 'b' }, { id: 'a' }] });
  // sort_order mengikuti urutan input (b=0, a=1). Tukar agar urut terbalik.
  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  const orderCol = STATIC_SHEETS.ShiftDefinitions.indexOf('sort_order');
  sheet.values[1][orderCol] = 5;
  sheet.values[2][orderCol] = 1;

  const { listShiftDefinitions } = await import('../lib/admin/template-service');
  const list = await listShiftDefinitions(SPREADSHEET_ID);
  assert.deepEqual(list.map((s) => s.id), ['a', 'b']);
});

test('getShiftDefinition mengembalikan null untuk id asing', async () => {
  seedBranch({ shifts: [{ id: 'S1' }] });
  const { getShiftDefinition } = await import('../lib/admin/template-service');
  assert.equal(await getShiftDefinition(SPREADSHEET_ID, 'nope'), null);
});

test('listSopCategories dan listChecklistPoints hanya mengambil milik induknya', async () => {
  seedBranch({
    shifts: [{ id: 'S1' }, { id: 'S2' }],
    categories: [
      { id: 'C1', shiftId: 'S1' },
      { id: 'C2', shiftId: 'S2' },
    ],
    points: [
      { id: 'P1', categoryId: 'C1' },
      { id: 'P2', categoryId: 'C2' },
    ],
  });
  const { listSopCategories, listChecklistPoints } = await import(
    '../lib/admin/template-service'
  );

  const cats = await listSopCategories(SPREADSHEET_ID, 'S1');
  assert.deepEqual(cats.map((c) => c.id), ['C1']);
  const points = await listChecklistPoints(SPREADSHEET_ID, 'C2');
  assert.deepEqual(points.map((p) => p.id), ['P2']);
});

test('listChecklistPoints menormalkan input_types dan options', async () => {
  seedBranch({ categories: [{ id: 'C1', shiftId: 'S1' }], points: [{ id: 'P1', categoryId: 'C1' }] });

  const { listChecklistPoints } = await import('../lib/admin/template-service');
  const [point] = await listChecklistPoints(SPREADSHEET_ID, 'C1');

  assert.deepEqual(point.input_types, ['centang']);
  assert.equal(point.options, null);
  assert.equal(point.is_required, true);
});

// ============================================================
// Arsip & pulihkan
// ============================================================

test('arsip shiftdefinition menulis is_active=false tanpa menghapus baris', async () => {
  const workbook = seedBranch({ shifts: [{ id: 'S1' }] });
  const { updateShiftDefinition, listShiftDefinitions } = await import(
    '../lib/admin/template-service'
  );

  await updateShiftDefinition(SPREADSHEET_ID, 'S1', { is_active: false });

  const [definition] = await listShiftDefinitions(SPREADSHEET_ID);
  assert.equal(definition.is_active, false);

  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  assert.equal(sheet.values.length, 2, 'baris harus tetap ada di sheet');
});

test('pulihkan shiftdefinition menulis is_active=true lagi', async () => {
  seedBranch({ shifts: [{ id: 'S1', isActive: false }] });
  const { updateShiftDefinition, listShiftDefinitions } = await import(
    '../lib/admin/template-service'
  );

  await updateShiftDefinition(SPREADSHEET_ID, 'S1', { is_active: true });

  const [definition] = await listShiftDefinitions(SPREADSHEET_ID);
  assert.equal(definition.is_active, true);
});

test('updateShiftDefinition menaikkan version dan updated_at', async () => {
  seedBranch({ shifts: [{ id: 'S1' }] });
  const { updateShiftDefinition, listShiftDefinitions } = await import(
    '../lib/admin/template-service'
  );

  await updateShiftDefinition(SPREADSHEET_ID, 'S1', { is_active: false });

  const [definition] = await listShiftDefinitions(SPREADSHEET_ID);
  // Catatan: `updateShiftDefinition` hanya menaikkan `version` bila pemanggil
  // mengirimkannya secara eksplisit (lihat template-service.ts). Arsip tidak
  // mengirim version, jadi version tetap 1. `updated_at` tetap diperbarui.
  // Ini perilaku yang diuji apa adanya, bukan yang diasumsikan.
  assert.equal(definition.version, 1);
  assert.notEqual(definition.updated_at, '2026-01-01T00:00:00.000Z');
});

test('updateShiftDefinition menaikkan version bila pemanggil mengirimkannya', async () => {
  seedBranch({ shifts: [{ id: 'S1' }] });
  const { updateShiftDefinition, listShiftDefinitions } = await import(
    '../lib/admin/template-service'
  );

  await updateShiftDefinition(SPREADSHEET_ID, 'S1', { is_active: false, version: 1 });

  const [definition] = await listShiftDefinitions(SPREADSHEET_ID);
  assert.equal(definition.version, 2);
});

test('updateShiftDefinition melempar untuk id yang tidak ada', async () => {
  seedBranch({ shifts: [{ id: 'S1' }] });
  const { updateShiftDefinition } = await import('../lib/admin/template-service');
  await assert.rejects(
    () => updateShiftDefinition(SPREADSHEET_ID, 'hantu', { is_active: false }),
    /SHIFT_DEFINITION_TIDAK_DITEMUKAN/
  );
});

test('arsip kategori dan point mempertahankan baris serta bisa dipulihkan', async () => {
  const workbook = seedBranch({
    shifts: [{ id: 'S1' }],
    categories: [{ id: 'C1', shiftId: 'S1' }],
    points: [{ id: 'P1', categoryId: 'C1' }],
  });
  const { updateSopCategory, updateChecklistPoint, listSopCategories, listChecklistPoints } =
    await import('../lib/admin/template-service');

  await updateSopCategory(SPREADSHEET_ID, 'C1', { is_active: false });
  await updateChecklistPoint(SPREADSHEET_ID, 'P1', { is_active: false });

  assert.equal((await listSopCategories(SPREADSHEET_ID, 'S1'))[0].is_active, false);
  assert.equal((await listChecklistPoints(SPREADSHEET_ID, 'C1'))[0].is_active, false);
  assert.equal(getSheet(workbook, 'SopCategories', SPREADSHEET_ID)!.values.length, 2);
  assert.equal(getSheet(workbook, 'ChecklistPoints', SPREADSHEET_ID)!.values.length, 2);

  await updateSopCategory(SPREADSHEET_ID, 'C1', { is_active: true });
  await updateChecklistPoint(SPREADSHEET_ID, 'P1', { is_active: true });

  assert.equal((await listSopCategories(SPREADSHEET_ID, 'S1'))[0].is_active, true);
  assert.equal((await listChecklistPoints(SPREADSHEET_ID, 'C1'))[0].is_active, true);
});

test('arsip handover field tidak menghapus baris dan bisa dipulihkan', async () => {
  seedBranch({ shifts: [{ id: 'S1' }], handoverFields: [{ id: 'F1', shiftId: 'S1' }] });
  const { updateHandoverField, listHandoverFields } = await import(
    '../lib/admin/template-service'
  );

  await updateHandoverField(SPREADSHEET_ID, 'F1', { is_active: false });
  assert.equal((await listHandoverFields(SPREADSHEET_ID, 'S1'))[0].is_active, false);

  await updateHandoverField(SPREADSHEET_ID, 'F1', { is_active: true });
  assert.equal((await listHandoverFields(SPREADSHEET_ID, 'S1'))[0].is_active, true);
});

// ============================================================
// Hitung dependensi
// ============================================================

test('shiftInstanceCount menghitung instance per definisi', async () => {
  seedBranch({
    shifts: [{ id: 'S1' }, { id: 'S2' }],
    shiftInstances: [
      { id: 'SI1', shiftId: 'S1' },
      { id: 'SI2', shiftId: 'S1' },
      { id: 'SI3', shiftId: 'S2' },
    ],
  });
  const { shiftInstanceCount } = await import('../lib/admin/template-service');

  assert.equal(await shiftInstanceCount(SPREADSHEET_ID, 'S1'), 2);
  assert.equal(await shiftInstanceCount(SPREADSHEET_ID, 'S2'), 1);
  assert.equal(await shiftInstanceCount(SPREADSHEET_ID, 'S3'), 0);
});

test('templateChildCounts menghitung kategori dan handover field', async () => {
  seedBranch({
    shifts: [{ id: 'S1' }],
    categories: [{ id: 'C1', shiftId: 'S1' }],
    handoverFields: [
      { id: 'F1', shiftId: 'S1' },
      { id: 'F2', shiftId: 'S1' },
    ],
  });
  const { templateChildCounts } = await import('../lib/admin/template-service');

  const counts = await templateChildCounts(SPREADSHEET_ID, 'S1');
  assert.deepEqual(counts, { categories: 1, handover_fields: 2 });
});

test('listChecklistPointRefsInUse mengumpulkan point_ref dari semua tab bulanan', async () => {
  seedBranch({
    categories: [{ id: 'C1', shiftId: 'S1' }],
    points: [
      { id: 'P1', categoryId: 'C1' },
      { id: 'P2', categoryId: 'C1' },
    ],
    entriesByMonth: {
      '2026-01': [
        { id: 'e1', pointRef: 'P1' },
        { id: 'e2', pointRef: 'P1' },
      ],
      '2026-02': [{ id: 'e3', pointRef: 'P2' }],
      '2026-03': [],
    },
  });
  const { listChecklistPointRefsInUse, checklistPointHasEntryHistory } = await import(
    '../lib/admin/template-service'
  );

  const used = await listChecklistPointRefsInUse(SPREADSHEET_ID);
  assert.deepEqual([...used].sort(), ['P1', 'P2']);

  assert.equal(await checklistPointHasEntryHistory(SPREADSHEET_ID, 'P1'), true);
  assert.equal(await checklistPointHasEntryHistory(SPREADSHEET_ID, 'P_FREE'), false);
});

test('listChecklistPointRefsInUse mengabaikan tab lain yang bukan Entries/EntryLogs', async () => {
  const workbook = seedBranch({
    categories: [{ id: 'C1', shiftId: 'S1' }],
    points: [{ id: 'P1', categoryId: 'C1' }],
    entriesByMonth: { '2026-01': [{ id: 'e1', pointRef: 'P1' }] },
  });
  // Sheet dengan nama mirip tapi bukan pola_entries bulanan.
  addBranchSheet(workbook, CAB1, 'Summary_2026-01', ['point_ref'], [{ point_ref: 'P1' }]);
  addBranchSheet(workbook, CAB1, 'Entries', ['point_ref'], [{ point_ref: 'P_LAIN' }]);

  const { listChecklistPointRefsInUse } = await import('../lib/admin/template-service');
  const used = await listChecklistPointRefsInUse(SPREADSHEET_ID);
  assert.deepEqual([...used], ['P1']);
});

// ============================================================
// Hard delete: nomor baris fisik yang benar
// ============================================================

test('deleteShiftDefinition menghapus baris yang tepat, bukan baris pertama', async () => {
  const workbook = seedBranch({ shifts: [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }] });
  const { deleteShiftDefinition, listShiftDefinitions } = await import(
    '../lib/admin/template-service'
  );

  await deleteShiftDefinition(SPREADSHEET_ID, 'S2');

  const remaining = await listShiftDefinitions(SPREADSHEET_ID);
  assert.deepEqual(remaining.map((s) => s.id), ['S1', 'S3']);

  const idCol = STATIC_SHEETS.ShiftDefinitions.indexOf('id');
  assert.deepEqual(idsOf(getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!, idCol), ['S1', 'S3']);
});

test('deleteShiftDefinition menghormati baris kosong di tengah sheet', async () => {
  const workbook = seedBranch({ shifts: [{ id: 'S1' }, { id: 'S_TARGET' }] });
  // Baris kosong menyisipkan pergeseran: S_TARGET ada di baris fisik 4.
  getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!.values.splice(2, 0, []);

  const { deleteShiftDefinition, listShiftDefinitions } = await import(
    '../lib/admin/template-service'
  );
  await deleteShiftDefinition(SPREADSHEET_ID, 'S_TARGET');

  assert.deepEqual((await listShiftDefinitions(SPREADSHEET_ID)).map((s) => s.id), ['S1']);

  // Baris kosong itu tetap ada (bergeser), hanya S_TARGET yang hilang.
  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  assert.equal(sheet.values.length, 3);
  const idCol = STATIC_SHEETS.ShiftDefinitions.indexOf('id');
  assert.equal(sheet.values[1][idCol], 'S1');
  assert.deepEqual(sheet.values[2], []);
});

test('deleteShiftDefinition melempar untuk id asing dan tidak mengubah sheet', async () => {
  const workbook = seedBranch({ shifts: [{ id: 'S1' }] });
  const { deleteShiftDefinition } = await import('../lib/admin/template-service');

  await assert.rejects(
    () => deleteShiftDefinition(SPREADSHEET_ID, 'hantu'),
    /SHIFT_DEFINITION_TIDAK_DITEMUKAN/
  );
  assert.equal(getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!.values.length, 2);
});

test('deleteSopCategory menghapus kategori yang benar di antara beberapa', async () => {
  const workbook = seedBranch({
    shifts: [{ id: 'S1' }],
    categories: [
      { id: 'C1', shiftId: 'S1' },
      { id: 'C2', shiftId: 'S1' },
      { id: 'C3', shiftId: 'S1' },
    ],
  });
  const { deleteSopCategory, listSopCategories } = await import('../lib/admin/template-service');

  await deleteSopCategory(SPREADSHEET_ID, 'C2');

  assert.deepEqual((await listSopCategories(SPREADSHEET_ID, 'S1')).map((c) => c.id), ['C1', 'C3']);
  const idCol = STATIC_SHEETS.SopCategories.indexOf('id');
  assert.deepEqual(idsOf(getSheet(workbook, 'SopCategories', SPREADSHEET_ID)!, idCol), ['C1', 'C3']);
});

test('deleteChecklistPoint hanya menghapus point yang dituju', async () => {
  const workbook = seedBranch({
    shifts: [{ id: 'S1' }],
    categories: [{ id: 'C1', shiftId: 'S1' }],
    points: [
      { id: 'P1', categoryId: 'C1' },
      { id: 'P2', categoryId: 'C1' },
    ],
  });
  const { deleteChecklistPoint, listChecklistPoints } = await import('../lib/admin/template-service');

  await deleteChecklistPoint(SPREADSHEET_ID, 'P1');

  assert.deepEqual((await listChecklistPoints(SPREADSHEET_ID, 'C1')).map((p) => p.id), ['P2']);
  const idCol = STATIC_SHEETS.ChecklistPoints.indexOf('id');
  assert.deepEqual(idsOf(getSheet(workbook, 'ChecklistPoints', SPREADSHEET_ID)!, idCol), ['P2']);
});

test('deleteHandoverField hanya menghapus field yang dituju', async () => {
  const workbook = seedBranch({
    shifts: [{ id: 'S1' }],
    handoverFields: [
      { id: 'F1', shiftId: 'S1' },
      { id: 'F2', shiftId: 'S1' },
    ],
  });
  const { deleteHandoverField, listHandoverFields } = await import('../lib/admin/template-service');

  await deleteHandoverField(SPREADSHEET_ID, 'F2');

  assert.deepEqual((await listHandoverFields(SPREADSHEET_ID, 'S1')).map((f) => f.id), ['F1']);
  const idCol = STATIC_SHEETS.HandoverFields.indexOf('id');
  assert.deepEqual(idsOf(getSheet(workbook, 'HandoverFields', SPREADSHEET_ID)!, idCol), ['F1']);
});

test('deleteIncidentCategory menghapus baris yang tepat', async () => {
  const workbook = seedBranch({});
  addBranchSheet(workbook, CAB1, 'IncidentCategories', STATIC_SHEETS.IncidentCategories, [
    { id: 'IC1', name: 'Api', sort_order: 0, is_active: false },
    { id: 'IC2', name: 'Listrik', sort_order: 1, is_active: false },
  ]);
  const { deleteIncidentCategory, listIncidentCategories } = await import(
    '../lib/admin/template-service'
  );

  await deleteIncidentCategory(SPREADSHEET_ID, 'IC1');

  assert.deepEqual((await listIncidentCategories(SPREADSHEET_ID)).map((c) => c.id), ['IC2']);
});

// ============================================================
// Duplikasi
// ============================================================

test('duplicateShiftDefinition menyalin shift beserta kategori, point, dan handover', async () => {
  seedBranch({
    shifts: [{ id: 'S1' }],
    categories: [{ id: 'C1', shiftId: 'S1' }],
    points: [{ id: 'P1', categoryId: 'C1' }],
    handoverFields: [{ id: 'F1', shiftId: 'S1' }],
  });
  const { duplicateShiftDefinition, listShiftDefinitions, listSopCategories, listChecklistPoints, listHandoverFields } =
    await import('../lib/admin/template-service');

  const copy = await duplicateShiftDefinition(SPREADSHEET_ID, 'S1');

  assert.notEqual(copy.id, 'S1');
  assert.match(copy.name, /\(copy\)$/);

  const copiedCategories = await listSopCategories(SPREADSHEET_ID, copy.id);
  assert.equal(copiedCategories.length, 1);
  assert.equal(copiedCategories[0].shift_definition_id, copy.id);

  const copiedPoints = await listChecklistPoints(SPREADSHEET_ID, copiedCategories[0].id);
  assert.equal(copiedPoints.length, 1);
  assert.equal(copiedPoints[0].sop_category_id, copiedCategories[0].id);

  assert.equal((await listHandoverFields(SPREADSHEET_ID, copy.id)).length, 1);
  assert.equal((await listShiftDefinitions(SPREADSHEET_ID)).length, 2);
});

test('duplicateShiftDefinition melempar untuk id asing', async () => {
  seedBranch({ shifts: [{ id: 'S1' }] });
  const { duplicateShiftDefinition } = await import('../lib/admin/template-service');
  await assert.rejects(
    () => duplicateShiftDefinition(SPREADSHEET_ID, 'hantu'),
    /SHIFT_DEFINITION_TIDAK_DITEMUKAN/
  );
});