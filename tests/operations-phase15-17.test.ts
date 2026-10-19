// tests/operations-phase15-17.test.ts
// Fase 15–17: warna section + atribusi, snapshot passthrough, katalog pengaturan.
import test from 'node:test';
import assert from 'node:assert';
import './helpers/mock-sheets';
import { addSheet, DEFAULT_SPREADSHEET_ID } from './helpers/fake-sheets';
import {
  normalizeSectionColor,
  sectionFallbackColor,
  sectionTextColor,
  resolvedSectionColor,
} from '../lib/shared/section-color';
import { STATIC_SHEETS } from '../lib/schema/registry';
import { buildTemplateSnapshot, type SnapshotCategory } from '../lib/db/snapshot';
import { SETTINGS_CATALOG } from '../lib/admin/settings-catalog';
import { seedRegistry } from './helpers/mock-registry';

test('Fase 16: validasi warna, kontras, dan fallback', () => {
  assert.strictEqual(normalizeSectionColor('#4ADE80'), '#4ade80');
  assert.strictEqual(normalizeSectionColor(' #4ade80 '), '#4ade80');
  assert.strictEqual(normalizeSectionColor(''), null);
  assert.strictEqual(normalizeSectionColor('#123'), null);
  assert.strictEqual(normalizeSectionColor('red'), null);
  assert.strictEqual(normalizeSectionColor('#4ade8'), null);
  assert.strictEqual(normalizeSectionColor('#4ade80g'), null);
  assert.strictEqual(normalizeSectionColor(null), null);

  // Fallback grayscale deterministik.
  assert.strictEqual(sectionFallbackColor(0), sectionFallbackColor(0));
  assert.strictEqual(sectionFallbackColor(4), sectionFallbackColor(0));
  assert.match(sectionFallbackColor(1), /^#[0-9a-f]{6}$/);

  // Kontras teks: latar terang -> teks gelap; latar gelap -> teks terang.
  assert.strictEqual(sectionTextColor('#ffffff'), '#1f2937');
  assert.strictEqual(sectionTextColor('#1f2937'), '#f9fafb');
  assert.strictEqual(sectionTextColor('not-hex'), '#1f2937');

  // Resolved: nilai valid dipakai, tidak valid -> fallback.
  assert.strictEqual(resolvedSectionColor('#4ade80', 0), '#4ade80');
  assert.strictEqual(resolvedSectionColor(undefined, 0), sectionFallbackColor(0));
});

test('Fase 16: header SopCategories berakhir dengan kolom color', () => {
  const headers = STATIC_SHEETS.SopCategories;
  assert.strictEqual(headers[headers.length - 1], 'color');
  assert.strictEqual(headers.indexOf('color'), headers.length - 1);
});

test('Fase 16: warna category masuk snapshot template', async () => {
  const workbook = seedRegistry([]);
  addSheet(workbook, 'ShiftDefinitions', ['id', 'name', 'start_time', 'end_time', 'crosses_midnight'], [
    { id: 'sd1', name: 'Opening', start_time: '07:00', end_time: '13:00', crosses_midnight: false },
  ]);
  addSheet(workbook, '_meta', ['key', 'value'], [{ key: 'tolerance_default_minutes', value: '15' }]);
  addSheet(
    workbook,
    'SopCategories',
    ['id', 'shift_definition_id', 'name', 'sort_order', 'is_active', 'color'],
    [
      { id: 'cat1', shift_definition_id: 'sd1', name: 'Dapur', sort_order: 1, is_active: true, color: '#4ADE80' },
      { id: 'cat2', shift_definition_id: 'sd1', name: 'Lantai', sort_order: 2, is_active: true, color: '' },
      { id: 'cat3', shift_definition_id: 'sd1', name: 'Arsip', sort_order: 3, is_active: false, color: '#ff0000' },
    ]
  );
  addSheet(
    workbook,
    'ChecklistPoints',
    ['id', 'sop_category_id', 'title', 'is_required', 'is_active', 'sort_order', 'points'],
    [
      { id: 'pt1', sop_category_id: 'cat1', title: 'Sinkin', is_required: true, is_active: true, sort_order: 1, points: 2 },
    ]
  );
  addSheet(
    workbook,
    'HandoverFields',
    ['id', 'shift_definition_id', 'label', 'field_type', 'is_required', 'sort_order'],
    []
  );
  addSheet(
    workbook,
    'IncidentCategories',
    ['id', 'name', 'points', 'penalty_min_severity', 'is_active'],
    []
  );

  assert.strictEqual(DEFAULT_SPREADSHEET_ID, 'default');
  const snap = await buildTemplateSnapshot('default', 'sd1', 'Asia/Jakarta');

  const cats = snap.categories as SnapshotCategory[];
  assert.strictEqual(cats.length, 2); // arsip dinonaktifkan -> tidak masuk snapshot
  assert.strictEqual(cats[0].color, '#4ade80');
  assert.strictEqual(cats[1].color, null); // '' -> null -> UI pakai fallback grayscale
  assert.strictEqual(cats[0].points.length, 1);
});

test('Fase 17: katalog pengaturan memakai session_hours', () => {
  const keys = SETTINGS_CATALOG.map((c) => c.key);
  assert.ok(keys.includes('session_hours'));
  assert.ok(!keys.includes('session_days'));
  const sessionHours = SETTINGS_CATALOG.find((c) => c.key === 'session_hours');
  assert.ok(sessionHours);
  assert.strictEqual(sessionHours.valueType, 'int');
});
