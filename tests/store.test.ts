// tests/store.test.ts
// Uji lapisan akses data (lib/store.ts) terhadap fake Sheets.
//
// Fokus pada hal yang rawan salah dan sulit diamati dari kode: pemetaan nomor
// baris fisik, pembacaan segar vs cache, dan penulisan batch.

// PENTING: helper mock harus diimpor lebih dulu — ia memasang fake Sheets
// client di require.cache sebelum modul source dimuat.
import test from 'node:test';
import assert from 'node:assert/strict';

import { addSheet, getSheet, useWorkbook } from './helpers/mock-sheets';
import { STATIC_SHEETS } from '../lib/google/branch-schema';

const SPREADSHEET_ID = 'store-uji';

function sheetWith(rows: Record<string, unknown>[]) {
  const { workbook } = useWorkbook();
  addSheet(workbook, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, rows, SPREADSHEET_ID);
  return workbook;
}

const shiftRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Shift ${id}`,
  start_time: '08:00',
  end_time: '16:00',
  crosses_midnight: false,
  sort_order: 0,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
  ...extra,
});

// ============================================================
// listRows / filterRows
// ============================================================

test('listRows memetakan header ke objek', async () => {
  sheetWith([shiftRow('s1')]);
  const { listRows } = await import('../lib/store');

  const rows = await listRows(SPREADSHEET_ID, 'ShiftDefinitions');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['id'], 's1');
  assert.equal(rows[0]['name'], 'Shift s1');
});

test('listRows tidak membaca baris kosong sebagai data', async () => {
  const { workbook } = useWorkbook();
  const sheet = addSheet(workbook, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [
    shiftRow('s1'),
  ], SPREADSHEET_ID);
  // Sisipkan baris kosong di tengah, seperti yang bisa terjadi di sheet asli.
  sheet.values.splice(2, 0, []);
  sheet.values.push(
    STATIC_SHEETS.ShiftDefinitions.map((h) => (h === 'id' ? 's2' : h === 'name' ? 'Shift s2' : ''))
  );

  const { listRows } = await import('../lib/store');
  const rows = await listRows(SPREADSHEET_ID, 'ShiftDefinitions');
  // Baris kosong di tengah dilewati, data sebelum & sesudahnya tetap terbaca.
  assert.deepEqual(rows.map((r) => r['id']), ['s1', 's2']);
});

test('listRows melempar saat sheet tidak ada', async () => {
  useWorkbook();
  const { listRows } = await import('../lib/store');
  await assert.rejects(() => listRows(SPREADSHEET_ID, 'TidakAda'), /Unable to parse range/);
});

test('filterRows menerapkan predicate', async () => {
  sheetWith([shiftRow('a', { is_active: true }), shiftRow('b', { is_active: false })]);
  const { filterRows } = await import('../lib/store');

  const aktif = await filterRows(SPREADSHEET_ID, 'ShiftDefinitions', (r) => r['is_active'] === true);
  assert.deepEqual(aktif.map((r) => r['id']), ['a']);
});

test('filterRowsMulti mengembalikan array per spec dengan urutan sama', async () => {
  const { workbook } = useWorkbook();
  addSheet(
    workbook,
    'ShiftDefinitions',
    STATIC_SHEETS.ShiftDefinitions,
    [shiftRow('a'), shiftRow('b')],
    SPREADSHEET_ID
  );
  addSheet(
    workbook,
    'SopCategories',
    STATIC_SHEETS.SopCategories,
    [
      { id: 'c1', shift_definition_id: 'a', name: 'K1', is_active: true },
      { id: 'c2', shift_definition_id: 'b', name: 'K2', is_active: true },
    ],
    SPREADSHEET_ID
  );

  const { filterRowsMulti } = await import('../lib/store');
  const [defs, cats] = await filterRowsMulti(SPREADSHEET_ID, [
    { sheet: 'ShiftDefinitions' },
    { sheet: 'SopCategories', predicate: (r) => r['shift_definition_id'] === 'a' },
  ]);

  assert.equal(defs.length, 2);
  assert.deepEqual(cats.map((c) => c['id']), ['c1']);
});

test('filterRowsMulti dengan specs kosong tidak memanggil API', async () => {
  useWorkbook();
  const { filterRowsMulti } = await import('../lib/store');
  assert.deepEqual(await filterRowsMulti(SPREADSHEET_ID, []), []);
});

// ============================================================
// Nomor baris fisik — inti dari findRow/deleteSheetRows
// ============================================================

test('listRowsWithNumber memberi rowNumber fisik: header=1, data mulai 2', async () => {
  sheetWith([shiftRow('s1'), shiftRow('s2')]);
  const { listRowsWithNumber } = await import('../lib/store');

  const rows = await listRowsWithNumber(SPREADSHEET_ID, 'ShiftDefinitions');
  assert.deepEqual(rows.map((r) => r.rowNumber), [2, 3]);
  assert.deepEqual(rows.map((r) => r.data['id']), ['s1', 's2']);
});

test('listRowsWithNumberFresh menghitung nomor baris dengan baris kosong ikut terhitung', async () => {
  const { workbook } = useWorkbook();
  const sheet = addSheet(
    workbook,
    'ShiftDefinitions',
    STATIC_SHEETS.ShiftDefinitions,
    [shiftRow('s1'), shiftRow('s3')],
    SPREADSHEET_ID
  );
  // Baris kosong di tengah: pada pembacaan mentah Sheets baris ini tetap ada
  // sebagai array kosong, sehingga baris berikutnya berada pada baris fisik 4.
  sheet.values.splice(2, 0, []);

  const { listRowsWithNumberFresh } = await import('../lib/store');
  const rows = await listRowsWithNumberFresh(SPREADSHEET_ID, 'ShiftDefinitions');

  // Baris kosong tetap ikut sebagai entri (data kosong) supaya nomor fisiknya
  // tidak bergeser — itulah alasan pembacaan ini memakai jalur mentah.
  assert.deepEqual(rows.map((r) => r.rowNumber), [2, 3, 4]);
  assert.deepEqual(rows.map((r) => r.data['id']), ['s1', undefined, 's3']);
});

test('findRowFresh mengembalikan nomor baris fisik yang benar walau ada baris kosong', async () => {
  const { workbook } = useWorkbook();
  const sheet = addSheet(
    workbook,
    'ShiftDefinitions',
    STATIC_SHEETS.ShiftDefinitions,
    [shiftRow('s1'), shiftRow('target')],
    SPREADSHEET_ID
  );
  sheet.values.splice(2, 0, []);

  const { findRowFresh } = await import('../lib/store');
  const found = await findRowFresh(SPREADSHEET_ID, 'ShiftDefinitions', 'id', 'target');

  assert.ok(found);
  assert.equal(found.rowNumber, 4);
});

test('findRowFresh mengembalikan null bila id tidak ada', async () => {
  sheetWith([shiftRow('s1')]);
  const { findRowFresh } = await import('../lib/store');
  assert.equal(await findRowFresh(SPREADSHEET_ID, 'ShiftDefinitions', 'id', 'nope'), null);
});

// ============================================================
// Tulis: insertRow / updateRow
// ============================================================

test('insertRow menambahkan baris dengan nilai sesuai posisi header', async () => {
  const { workbook } = useWorkbook();
  addSheet(workbook, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [shiftRow('s1')], SPREADSHEET_ID);
  const { insertRow } = await import('../lib/store');

  await insertRow(SPREADSHEET_ID, 'ShiftDefinitions', {
    id: 'baru',
    name: 'Shift Baru',
    start_time: '20:00',
    end_time: '04:00',
    is_active: true,
    version: 1,
  });

  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  const headers = STATIC_SHEETS.ShiftDefinitions;
  assert.equal(sheet.values.length, 3); // header + 2 data
  const inserted = sheet.values[2];
  assert.equal(inserted[headers.indexOf('id')], 'baru');
  assert.equal(inserted[headers.indexOf('name')], 'Shift Baru');
  assert.equal(inserted[headers.indexOf('start_time')], '20:00');
});

test('insertRow menyimpan boolean sebagai TRUE/FALSE seperti Sheets RAW', async () => {
  const { workbook } = useWorkbook();
  addSheet(workbook, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [], SPREADSHEET_ID);
  const { insertRow } = await import('../lib/store');

  await insertRow(SPREADSHEET_ID, 'ShiftDefinitions', { id: 'x', is_active: false });

  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  assert.equal(sheet.values[1][STATIC_SHEETS.ShiftDefinitions.indexOf('is_active')], 'FALSE');
});

test('insertRow mengisi kolom yang tidak diberikan dengan string kosong', async () => {
  const { workbook } = useWorkbook();
  addSheet(workbook, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [], SPREADSHEET_ID);
  const { insertRow } = await import('../lib/store');

  await insertRow(SPREADSHEET_ID, 'ShiftDefinitions', { id: 'x', name: 'X' });

  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  assert.equal(sheet.values[0].length, STATIC_SHEETS.ShiftDefinitions.length);
  const idCol = STATIC_SHEETS.ShiftDefinitions.indexOf('id');
  const instructionColLike = STATIC_SHEETS.ShiftDefinitions.indexOf('crosses_midnight');
  assert.equal(sheet.values[1][idCol], 'x');
  assert.equal(sheet.values[1][instructionColLike], '');
});

test('updateRow hanya mengubah kolom yang diberikan', async () => {
  const { workbook } = useWorkbook();
  addSheet(workbook, 'ShiftDefinitions', STATIC_SHEETS.ShiftDefinitions, [shiftRow('s1')], SPREADSHEET_ID);
  const { updateRow } = await import('../lib/store');

  await updateRow(SPREADSHEET_ID, 'ShiftDefinitions', 2, { is_active: false });

  const sheet = getSheet(workbook, 'ShiftDefinitions', SPREADSHEET_ID)!;
  const headers = STATIC_SHEETS.ShiftDefinitions;
  const row = sheet.values[1];
  assert.equal(row[headers.indexOf('is_active')], 'FALSE');
  assert.equal(row[headers.indexOf('name')], 'Shift s1');
  assert.equal(row[headers.indexOf('id')], 's1');
});

test('updateRow melempar saat kolom tidak dikenal di sheet', async () => {
  sheetWith([shiftRow('s1')]);
  const { updateRow } = await import('../lib/store');
  await assert.rejects(
    () => updateRow(SPREADSHEET_ID, 'ShiftDefinitions', 2, { kolom_ngawur: 1 }),
    /tidak ada di sheet/
  );
});

// ============================================================
// Parse nilai
// ============================================================

test('asBool mengenali representasi boolean Google Sheets', async () => {
  const { asBool } = await import('../lib/store');
  for (const truthy of [true, 'true', 'TRUE', 'True', '1', 1]) {
    assert.equal(asBool(truthy), true, String(truthy));
  }
  for (const falsy of [false, 'false', 'FALSE', '', null, undefined, 'ya']) {
    assert.equal(asBool(falsy), false, String(falsy));
  }
});

test('asNum mengembalikan null untuk nilai kosong atau bukan angka', async () => {
  const { asNum } = await import('../lib/store');
  assert.equal(asNum('42'), 42);
  assert.equal(asNum(0), 0);
  assert.equal(asNum(''), null);
  assert.equal(asNum(null), null);
  assert.equal(asNum(undefined), null);
  assert.equal(asNum('abc'), null);
});

test('asStr mengubah null/undefined menjadi string kosong', async () => {
  const { asStr } = await import('../lib/store');
  assert.equal(asStr(null), '');
  assert.equal(asStr(undefined), '');
  assert.equal(asStr('x'), 'x');
  assert.equal(asStr(7), '7');
});