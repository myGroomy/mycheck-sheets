import test from 'node:test';
import assert from 'node:assert/strict';
import { addSheet, getSheet, useWorkbook } from './helpers/mock-sheets';
import { MONTHLY_SHEETS, YEARLY_SHEETS } from '../lib/schema/registry';
import { parseArchiveSpreadsheetIds, serializeArchiveSpreadsheetIds } from '../lib/google/registry';
import { cleanupCandidates, legacyDate } from '../lib/schema/cleanup';

test('periodOf memakai timezone cabang, bukan UTC', async () => {
  const { periodOf } = await import('../lib/schema/periods');
  const date = new Date('2026-10-31T17:30:00.000Z');
  assert.deepEqual(periodOf(date, 'Asia/Jakarta'), { tabMonth: '2026-11', tabYear: '2026' });
  assert.deepEqual(periodOf(date, 'America/Los_Angeles'), { tabMonth: '2026-10', tabYear: '2026' });
});

test('normalizer membaca boolean, integer, dan severity legacy', async () => {
  const { normalizeRead, normalizeWrite } = await import('../lib/schema/normalize');
  const input = { is_test: 'TRUE', points: '2.9', severity: 'medium' };
  assert.deepEqual(normalizeRead(input), { is_test: true, points: 2, severity: 'sedang' });
  assert.deepEqual(normalizeWrite(input), { is_test: true, points: 2, severity: 'sedang' });
});

test('resolver arsip memakai format tahun:id yang stabil', () => {
  const entries = parseArchiveSpreadsheetIds('2025:archive-b, 2024:archive-a');
  assert.deepEqual(entries, [
    { year: '2025', spreadsheetId: 'archive-b' },
    { year: '2024', spreadsheetId: 'archive-a' },
  ]);
  assert.equal(serializeArchiveSpreadsheetIds(entries), '2024:archive-a,2025:archive-b');
});

test('cleanup Fase 7 hanya memilih legacy bertanggal yang melewati cutoff', () => {
  const cutoff = new Date('2026-01-31T00:00:00.000Z');
  const result = cleanupCandidates([
    { sheetId: 1, title: 'LEGACY_2025-12-31' },
    { sheetId: 2, title: 'LEGACY_2026-02-01' },
    { sheetId: 3, title: 'LEGACY_unknown' },
    { sheetId: 4, title: 'Summary' },
  ], cutoff);
  assert.deepEqual(result.remove.map(({ title }) => title), ['LEGACY_2025-12-31', 'Summary']);
  assert.deepEqual(result.skipped.map(({ title }) => title), ['LEGACY_2026-02-01', 'LEGACY_unknown']);
  assert.equal(legacyDate('LEGACY_2025-12-31')?.toISOString(), '2025-12-31T00:00:00.000Z');
  assert.equal(legacyDate('LEGACY_unknown'), null);
});

test('mode yearly membaca sheet tahunan dan legacy tanpa duplikasi id', async () => {
  const { workbook } = useWorkbook();
  const spreadsheetId = 'yearly-dual-read';
  addSheet(workbook, '_meta', ['key', 'value'], [
    { key: 'schema_version', value: '2' },
    { key: 'period_mode', value: 'yearly' },
  ], spreadsheetId);
  addSheet(workbook, 'Incidents_2026', YEARLY_SHEETS.Incidents, [
    { id: 'annual-1', tab_month: '2026-10' },
    { id: 'same-id', tab_month: '2026-09' },
  ], spreadsheetId);
  addSheet(workbook, 'Incidents_2026-09', MONTHLY_SHEETS.Incidents, [
    { id: 'same-id', tab_month: '2026-09' },
    { id: 'legacy-1', tab_month: '2026-09' },
  ], spreadsheetId);
  const { listMonthlyRows } = await import('../lib/store');
  const rows = await listMonthlyRows(spreadsheetId, 'Incidents', '2026-09');
  assert.deepEqual(rows.map((row) => row.id), ['annual-1', 'same-id', 'legacy-1']);
  assert.equal(getSheet(workbook, 'Incidents_2026', spreadsheetId)?.values.length, 3);
});

test('mode flat membaca dan menulis ke sheet generik tanpa suffix periode', async () => {
  const { workbook } = useWorkbook();
  const spreadsheetId = 'flat-branch';
  addSheet(workbook, '_meta', ['key', 'value'], [
    { key: 'schema_version', value: '2' },
    { key: 'period_mode', value: 'flat' },
  ], spreadsheetId);
  addSheet(workbook, 'Incidents', MONTHLY_SHEETS.Incidents, [
    { id: 'flat-1', tab_month: '2026-10' },
  ], spreadsheetId);
  const { listMonthlyRows, getPeriodSheet, listPeriodKeys } = await import('../lib/store');
  assert.equal(await getPeriodSheet(spreadsheetId, 'Incidents', '2026-10'), 'Incidents');
  assert.deepEqual(await listPeriodKeys(spreadsheetId, 'Incidents'), ['flat']);
  assert.deepEqual((await listMonthlyRows(spreadsheetId, 'Incidents', '2026-10')).map((row) => row.id), ['flat-1']);
});
