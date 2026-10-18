import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAuditHash } from '../lib/db/audit';
import { verifyAuditRows } from '../lib/db/audit-verifier';

function row(previous: string, sequence: number, action: string) {
  const value = { at: `2026-01-01T00:0${sequence}:00.000Z`, actor_id: 'petugas', action, object_type: 'test', object_id: `id-${sequence}`, branch_id: 'CBG', shift_instance_id: null, before: null, after: null, reason: null };
  return { id: `audit-${sequence}`, seq: sequence, ...value, prev_hash: previous, hash: computeAuditHash(previous, value) };
}

test('verifier menerima chain tahunan dengan anchor', () => {
  const first = row('anchor-2025', 1, 'open');
  const second = row(first.hash, 2, 'close');
  const result = verifyAuditRows([first, second], 'anchor-2025');
  assert.equal(result.valid, true);
  assert.equal(result.checked, 2);
});

test('verifier mendeteksi perubahan payload', () => {
  const first = row('', 1, 'open');
  first.action = 'tampered';
  const result = verifyAuditRows([first]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('hash')));
});
