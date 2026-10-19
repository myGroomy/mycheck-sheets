import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore } from '../lib/scoring';

test('weighted completion ignores informational points', () => {
  const result = calculateScore([
    { pointRef: 'A', points: 2, state: 'selesai' },
    { pointRef: 'B', points: 0, state: 'belum' },
    { pointRef: 'C', points: 1, state: 'belum' },
  ]);
  assert.deepEqual(result, { available: 3, earned: 2, completionPercent: 66.67, incidentPenalty: 0, finalScore: 2, scorePercent: 66.67 });
});

test('invalid and skipped items do not earn points and penalty is thresholded', () => {
  const result = calculateScore(
    [{ pointRef: 'A', points: 4, state: 'selesai', outOfRange: true }, { pointRef: 'B', points: 2, state: 'selesai' }],
    [{ points: 3, severity: 'rendah', penaltyMinSeverity: 'sedang' }, { points: 5, severity: 'tinggi', penaltyMinSeverity: 'tinggi' }]
  );
  assert.equal(result.available, 6);
  assert.equal(result.earned, 2);
  assert.equal(result.incidentPenalty, 5);
  assert.equal(result.finalScore, 0);
  assert.equal(result.scorePercent, 0);
});

test('legacy points default to one and score never becomes negative', () => {
  const result = calculateScore([{ pointRef: 'A', state: 'selesai' }], [{ points: 8, severity: 'tinggi', penaltyMinSeverity: 'rendah' }]);
  assert.equal(result.available, 1);
  assert.equal(result.earned, 1);
  assert.equal(result.finalScore, 0);
});
