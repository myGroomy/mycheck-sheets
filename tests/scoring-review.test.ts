import test from 'node:test';
import assert from 'node:assert';
import './helpers/mock-sheets';
import { calculateAndRecordShiftScoring } from '../lib/scoring-engine';
import { seedRegistry, addBranchSheet, branchSpreadsheetId } from './helpers/mock-registry';
import { MONTHLY_SHEETS, STATIC_SHEETS, monthlySheet } from '../lib/google/branch-schema';
import { insertRow, filterRows, asStr, asNum } from '../lib/store';

test('Fase 10-12: Scoring, Ledger, dan EntryReviews', async () => {
  const branchId = 'CAB_TEST';
  const workbook = seedRegistry([{ id: branchId, name: 'Cabang Test' }]);
  const spreadsheetId = branchSpreadsheetId(branchId);

  addBranchSheet(workbook, branchId, 'ShiftPjAssignments', STATIC_SHEETS.ShiftPjAssignments);
  addBranchSheet(workbook, branchId, 'ScoreLedger', STATIC_SHEETS.ScoreLedger);
  addBranchSheet(workbook, branchId, 'ShiftInstances', STATIC_SHEETS.ShiftInstances);
  addBranchSheet(workbook, branchId, monthlySheet('Entries', '2026-06'), MONTHLY_SHEETS.Entries);
  addBranchSheet(workbook, branchId, monthlySheet('EntryReviews', '2026-06'), MONTHLY_SHEETS.EntryReviews);

  const shiftInstanceId = 'shift-inst-101';
  const reportId = 'rep-101';

  // Buat ShiftInstance
  await insertRow(spreadsheetId, 'ShiftInstances', {
    id: shiftInstanceId,
    shift_definition_id: 'def-1',
    shift_date: '2026-06-01',
    tab_month: '2026-06',
    status: 'ditutup',
    pj_user_id: 'user-pj',
    template_snapshot: JSON.stringify({
      categories: [
        {
          id: 'cat-1',
          name: 'Kebersihan',
          points: [
            { id: 'pt-1', title: 'Lantai bersih', points: 10 },
            { id: 'pt-2', title: 'Kaca bersih', points: 10 },
          ],
        },
      ],
    }),
  });

  // Buat Entries
  await insertRow(spreadsheetId, monthlySheet('Entries', '2026-06'), {
    id: 'ent-1',
    shift_instance_id: shiftInstanceId,
    point_ref: 'pt-1',
    state: 'selesai',
    completed_by: 'user-worker-1',
  });
  await insertRow(spreadsheetId, monthlySheet('Entries', '2026-06'), {
    id: 'ent-2',
    shift_instance_id: shiftInstanceId,
    point_ref: 'pt-2',
    state: 'selesai',
    completed_by: 'user-worker-2',
  });

  // Buat EntryReviews (partial / valid)
  await insertRow(spreadsheetId, monthlySheet('EntryReviews', '2026-06'), {
    id: 'rev-1',
    shift_instance_id: shiftInstanceId,
    entry_id: 'ent-1',
    point_ref: 'pt-1',
    worker_user_id: 'user-worker-1',
    review_status: 'valid',
    base_points: 10,
    awarded_points: 10,
    review_stage: 'final',
  });
  await insertRow(spreadsheetId, monthlySheet('EntryReviews', '2026-06'), {
    id: 'rev-2',
    shift_instance_id: shiftInstanceId,
    entry_id: 'ent-2',
    point_ref: 'pt-2',
    worker_user_id: 'user-worker-2',
    review_status: 'partial',
    base_points: 10,
    awarded_points: 5,
    review_stage: 'final',
  });

  const result = await calculateAndRecordShiftScoring(spreadsheetId, branchId, shiftInstanceId, reportId, 1);

  assert.strictEqual(result.branchScore.available, 20);
  assert.strictEqual(result.branchScore.earned, 15); // 10 + 5
  assert.strictEqual(result.branchScore.scorePercent, 75);

  // Periksa ScoreLedger tercatat idempoten
  const ledgerRows = await filterRows(spreadsheetId, 'ScoreLedger', (r) => asStr(r['shift_instance_id']) === shiftInstanceId);
  const initialLength = ledgerRows.length;
  assert.ok(initialLength >= 3); // branch, pj, action

  // Retry kalkulasi (idempotensi ledger)
  const resultRetry = await calculateAndRecordShiftScoring(spreadsheetId, branchId, shiftInstanceId, reportId, 1);
  const ledgerRowsRetry = await filterRows(spreadsheetId, 'ScoreLedger', (r) => asStr(r['shift_instance_id']) === shiftInstanceId);
  assert.strictEqual(ledgerRowsRetry.length, initialLength);
});
