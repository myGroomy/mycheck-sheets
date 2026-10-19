// Fase 18-19: sinkronisasi generator template, ShiftPjAssignments (rasio PJ),
// upsert idempoten ScoreLedger, dan koreksi review final.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import './helpers/mock-sheets';
import { recordPjAssignment, endActivePjAssignments } from '../lib/pj-assignments';
import { calculateAndRecordShiftScoring, isScoringEnabled } from '../lib/scoring-engine';
import { seedRegistry, addBranchSheet, branchSpreadsheetId } from './helpers/mock-registry';
import { STATIC_SHEETS, MONTHLY_SHEETS, monthlySheet } from '../lib/google/branch-schema';
import { insertRow, updateRow, filterRows, findRow, listRows, asStr, asNum } from '../lib/store';

type Workbook = ReturnType<typeof seedRegistry>;

function parsePyDict(src: string, section: string, stopMarkers: string[]): Record<string, string[]> {
  const start = src.indexOf(`${section}: dict`);
  if (start < 0) throw new Error(`section ${section} tidak ada`);
  let end = src.length;
  for (const marker of stopMarkers) {
    const at = src.indexOf(marker, start + 1);
    if (at > 0 && at < end) end = at;
  }
  const block = src.slice(start, end);
  const out: Record<string, string[]> = {};
  const entryRe = /"(\w+)": \[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block))) {
    out[m[1]] = m[2].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
  }
  return out;
}

test('Fase 18: generator template XLSX sinkron dengan lib/schema/registry.ts', () => {
  const path = fileURLToPath(new URL('../scripts/generate-template.py', import.meta.url));
  const src = readFileSync(path, 'utf8');
  const pyStatic = parsePyDict(src, 'STATIC_SHEETS', ['PERIOD_SHEETS']);
  const pyPeriod = parsePyDict(src, 'PERIOD_SHEETS', ['REGISTRY_SHEETS']);

  // _meta dibuat manual oleh generator, tidak lewat dict STATIC.
  const registryStatic = { ...STATIC_SHEETS };
  delete registryStatic._meta;
  assert.deepEqual(pyStatic, registryStatic);
  assert.deepEqual(pyPeriod, MONTHLY_SHEETS);
});

test('Fase 18: recordPjAssignment + endActivePjAssignments menulis histori PJ', async () => {
  const branchId = 'CAB_PJ';
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang PJ' }]);
  const spreadsheetId = branchSpreadsheetId(branchId);
  addBranchSheet(workbook, branchId, 'ShiftPjAssignments', STATIC_SHEETS.ShiftPjAssignments);

  await recordPjAssignment(spreadsheetId, 'shift-1', 'user-a', 'open');
  await endActivePjAssignments(spreadsheetId, 'shift-1');
  await recordPjAssignment(spreadsheetId, 'shift-1', 'user-b', 'change_pj');

  const rows = await listRows(spreadsheetId, 'ShiftPjAssignments');
  assert.equal(rows.length, 2);
  assert.equal(asStr(rows[0]['user_id']), 'user-a');
  assert.equal(asStr(rows[0]['source']), 'open');
  assert.notEqual(asStr(rows[0]['ended_at']), '');
  assert.equal(asStr(rows[1]['user_id']), 'user-b');
  assert.equal(asStr(rows[1]['is_current']), 'TRUE');
});

/** Shift 2 point (@10) + 2 entry selesai oleh dua pekerja. */
async function seedScoreShift(
  workbook: Workbook,
  branchId: string,
  opts:
    | { assignments: [string, string, string][] }
    | { none: true }
) {
  const spreadsheetId = branchSpreadsheetId(branchId);
  const tabMonth = '2026-08';
  addBranchSheet(workbook, branchId, 'ShiftInstances', STATIC_SHEETS.ShiftInstances);
  addBranchSheet(workbook, branchId, 'ScoreLedger', STATIC_SHEETS.ScoreLedger);
  if (!('none' in opts)) {
    addBranchSheet(workbook, branchId, 'ShiftPjAssignments', STATIC_SHEETS.ShiftPjAssignments);
  }
  addBranchSheet(workbook, branchId, monthlySheet('Entries', tabMonth), MONTHLY_SHEETS.Entries);
  addBranchSheet(workbook, branchId, monthlySheet('EntryReviews', tabMonth), MONTHLY_SHEETS.EntryReviews);

  await insertRow(spreadsheetId, 'ShiftInstances', {
    id: 'shift-sc',
    shift_definition_id: 'def-1',
    shift_date: '2026-08-01',
    tab_month: tabMonth,
    status: 'ditutup',
    pj_user_id: 'user-fallback',
    template_snapshot: JSON.stringify({
      categories: [
        {
          id: 'cat-1',
          name: 'C',
          points: [
            { id: 'pt-1', title: 'P1', points: 10 },
            { id: 'pt-2', title: 'P2', points: 10 },
          ],
        },
      ],
    }),
  });
  await insertRow(spreadsheetId, monthlySheet('Entries', tabMonth), {
    id: 'ent-1', shift_instance_id: 'shift-sc', point_ref: 'pt-1', state: 'selesai', completed_by: 'worker-1',
  });
  await insertRow(spreadsheetId, monthlySheet('Entries', tabMonth), {
    id: 'ent-2', shift_instance_id: 'shift-sc', point_ref: 'pt-2', state: 'selesai', completed_by: 'worker-2',
  });

  if (!('none' in opts)) {
    for (const [userId, startedAt, endedAt] of opts.assignments) {
      await insertRow(spreadsheetId, 'ShiftPjAssignments', {
        id: `pja-${userId}`,
        shift_instance_id: 'shift-sc',
        user_id: userId,
        started_at: startedAt,
        ended_at: endedAt,
        is_current: true,
        source: 'change_pj',
        created_at: startedAt,
      });
    }
  }
  return spreadsheetId;
}

test('Fase 18: dua PJ mendapat rasio waktu 50/50 di ledger', async () => {
  const branchId = 'CAB_RASIO';
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang Rasio' }]);
  const spreadsheetId = await seedScoreShift(workbook, branchId, {
    assignments: [
      ['user-a', '2026-08-01T12:00:00Z', '2026-08-01T14:00:00Z'],
      ['user-b', '2026-08-01T14:00:00Z', '2026-08-01T16:00:00Z'],
    ],
  });

  const result = await calculateAndRecordShiftScoring(spreadsheetId, branchId, 'shift-sc', 'rep-1', 1);
  assert.equal(result.branchScore.earned, 20);
  assert.ok(Math.abs(result.pjScores['user-a'].ratio - 0.5) < 0.001);
  assert.ok(Math.abs(result.pjScores['user-b'].ratio - 0.5) < 0.001);
  assert.equal(result.pjScores['user-a'].available, 10);
  assert.equal(result.pjScores['user-a'].earned, 10);

  const pjRows = await filterRows(spreadsheetId, 'ScoreLedger', (r) => asStr(r['metric_type']) === 'pj');
  assert.equal(pjRows.length, 2);
  assert.ok(pjRows.every((r) => asNum(r['attribution_ratio']) === 0.5 && asNum(r['points_available']) === 10));
});

test('Fase 18: pergantian berkali-kali satu shift → rasio terbagi tiga', async () => {
  const branchId = 'CAB_BANYAK';
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang Banyak PJ' }]);
  const spreadsheetId = await seedScoreShift(workbook, branchId, {
    assignments: [
      ['user-a', '2026-08-01T12:00:00Z', '2026-08-01T13:00:00Z'],
      ['user-b', '2026-08-01T13:00:00Z', '2026-08-01T14:00:00Z'],
      ['user-c', '2026-08-01T14:00:00Z', '2026-08-01T15:00:00Z'],
    ],
  });

  const result = await calculateAndRecordShiftScoring(spreadsheetId, branchId, 'shift-sc', 'rep-1', 1);
  for (const uid of ['user-a', 'user-b', 'user-c']) {
    assert.ok(result.pjScores[uid]);
    assert.ok(Math.abs(result.pjScores[uid].ratio - 1 / 3) < 0.001);
    assert.ok(Math.abs(result.pjScores[uid].earned - 20 / 3) < 0.01);
  }
});

test('Fase 18: shift lama tanpa assignment memakai fallback pj_user_id', async () => {
  const branchId = 'CAB_LEGACY';
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang Legacy' }]);
  const spreadsheetId = await seedScoreShift(workbook, branchId, { none: true });

  const result = await calculateAndRecordShiftScoring(spreadsheetId, branchId, 'shift-sc', 'rep-1', 1);
  assert.ok(result.pjScores['user-fallback']);
  assert.equal(result.pjScores['user-fallback'].ratio, 1);
  assert.equal(result.pjScores['user-fallback'].earned, 20);
});

test('Fase 19: SCORE_DEPLOY=0 mematikan scoring tanpa menghapus kolom', () => {
  assert.equal(isScoringEnabled(), true);
  process.env.SCORE_DEPLOY = '0';
  assert.equal(isScoringEnabled(), false);
  delete process.env.SCORE_DEPLOY;
});

test('Fase 18: koreksi review final menyegarkan ledger tanpa menduplikasi baris', async () => {
  const branchId = 'CAB_KOREKSI';
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang Koreksi' }]);
  const spreadsheetId = await seedScoreShift(workbook, branchId, { assignments: [] });

  // Review partial dengan awarded 0 → ent-1 tidak memberi poin.
  await insertRow(spreadsheetId, monthlySheet('EntryReviews', '2026-08'), {
    id: 'rev-1', shift_instance_id: 'shift-sc', entry_id: 'ent-1', point_ref: 'pt-1',
    worker_user_id: 'worker-1', review_status: 'partial', base_points: 10, earned_points: 10,
    awarded_points: 0, review_stage: 'final',
  });
  const first = await calculateAndRecordShiftScoring(spreadsheetId, branchId, 'shift-sc', 'rep-1', 1);
  assert.equal(first.branchScore.earned, 10); // hanya ent-2 yang terhitung

  const ledgerBranchRow = (await filterRows(
    spreadsheetId,
    'ScoreLedger',
    (r) => asStr(r['scope_type']) === 'branch' && asStr(r['metric_type']) === 'branch'
  ))[0];
  assert.equal(asNum(ledgerBranchRow['final_points']), 10);

  // Koreksi review: awarded penuh → kalkulasi ulang memperbarui baris yang sama.
  const revRow = (await listRows(spreadsheetId, monthlySheet('EntryReviews', '2026-08')))[0];
  const revRowNumber = ((await listRows(spreadsheetId, monthlySheet('EntryReviews', '2026-08'))), 2);
  void revRow;
  await updateRow(spreadsheetId, monthlySheet('EntryReviews', '2026-08'), revRowNumber, {
    awarded_points: 10,
  });

  const before = await filterRows(spreadsheetId, 'ScoreLedger', () => true);
  const updated = await calculateAndRecordShiftScoring(spreadsheetId, branchId, 'shift-sc', 'rep-1', 1);
  const after = await filterRows(spreadsheetId, 'ScoreLedger', () => true);

  assert.equal(updated.branchScore.earned, 20);
  assert.equal(after.length, before.length, 'koreksi tidak menambah baris ledger');
  const refreshed = (await findRow(
    spreadsheetId,
    'ScoreLedger',
    'id',
    asStr(ledgerBranchRow['id'])
  ))!;
  assert.equal(asNum(refreshed.data['final_points']), 20);
});
