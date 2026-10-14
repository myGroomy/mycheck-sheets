// tests/lifecycle-policy.test.ts
// Uji siklus hidup data admin: arsip → tersembunyi, pulihkan → tampil, dan
// keputusan hapus permanen (boleh / ditolak) sesuai BR-40 & ADM-SEC-02.
//
// Hanya menguji `lib/admin/lifecycle-policy.ts`, yang murni tanpa Google
// Sheets. Perilaku I/O Sheets (listRow, deleteSheetRows, locate*) TIDAK diuji
// di sini dan tetap perlu verifikasi manual terhadap spreadsheet cabang.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canDeleteConfig,
  decidePermanentDelete,
  deletionBlockReason,
  filterArchiveView,
  matchesArchiveQuery,
  splitByArchive,
} from '../lib/admin/lifecycle-policy';

const item = (id: string, isActive: boolean, label = id) => ({ id, isActive, label });

// ============================================================
// Arsip: hide → restore
// ============================================================

test('splitByArchive memisahkan data kerja dari arsip tanpa mengubah urutan', () => {
  const rows = [item('a', true), item('b', false), item('c', true), item('d', false)];
  const { active, archived } = splitByArchive(rows);

  assert.deepEqual(active.map((r) => r.id), ['a', 'c']);
  assert.deepEqual(archived.map((r) => r.id), ['b', 'd']);
});

test('splitByArchive tidak mengubah array asal', () => {
  const rows = [item('a', true), item('b', false)];
  splitByArchive(rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].isActive, true);
});

test('splitByArchive menangani daftar kosong', () => {
  assert.deepEqual(splitByArchive([]), { active: [], archived: [] });
});

test('arsipkan menyembunyikan item dari daftar aktif', () => {
  const rows = [item('a', true, 'Shift Pagi'), item('b', false, 'Shift Lama')];

  const aktif = filterArchiveView(rows, { showArchived: false });
  assert.deepEqual(aktif.map((r) => r.id), ['a']);

  const arsip = filterArchiveView(rows, { showArchived: true });
  assert.deepEqual(arsip.map((r) => r.id), ['b']);
});

test('pulihkan mengembalikan item ke daftar aktif', () => {
  // Simulasi: item diarsipkan (isActive false) lalu dipulihkan (isActive true).
  const archived = [item('a', false, 'Shift Pagi')];
  assert.deepEqual(filterArchiveView(archived, { showArchived: false }), []);

  const restored = [item('a', true, 'Shift Pagi')];
  assert.deepEqual(
    filterArchiveView(restored, { showArchived: false }).map((r) => r.id),
    ['a']
  );
  assert.deepEqual(filterArchiveView(restored, { showArchived: true }), []);
});

test('pencarian arsip memakai searchFields dan mengabaikan query kosong', () => {
  const rows = [item('a', false, 'Shift Pagi'), item('b', false, 'Shift Malam')];
  const searchFields = (row: { label: string }) => [row.label];

  assert.deepEqual(
    filterArchiveView(rows, { showArchived: true, query: 'malam', searchFields }).map((r) => r.id),
    ['b']
  );
  assert.equal(filterArchiveView(rows, { showArchived: true, query: '   ', searchFields }).length, 2);
  assert.equal(filterArchiveView(rows, { showArchived: true, query: 'tidak ada', searchFields }).length, 0);
});

test('pencarian tidak berlaku pada mode aktif (hanya arsip yang dicari)', () => {
  const rows = [item('a', true, 'Shift Pagi'), item('b', false, 'Shift Malam')];
  const searchFields = (row: { label: string }) => [row.label];

  // Query 'malam' tidak boleh menyembunyikan apa pun di mode aktif.
  assert.deepEqual(
    filterArchiveView(rows, { showArchived: false, query: 'malam', searchFields }).map((r) => r.id),
    ['a']
  );
});

test('matchesArchiveQuery tahan spasi berlebih dan null', () => {
  assert.equal(matchesArchiveQuery('  Pagi ', 'Shift Pagi', null), true);
  assert.equal(matchesArchiveQuery('', 'apa saja'), true);
  assert.equal(matchesArchiveQuery('malam', 'Shift Pagi'), false);
  assert.equal(matchesArchiveQuery('x', null, undefined), false);
});

// ============================================================
// Hapus permanen: entitas archive-only
// ============================================================

test('cabang dan akun selalu ditolak untuk hapus permanen', () => {
  for (const entity of ['branch', 'user'] as const) {
    const decision = decidePermanentDelete(entity);
    assert.equal(decision.allowed, false, entity);
    assert.equal(decision.status, 409, entity);
    assert.equal(decision.reason, 'archive_only', entity);
    assert.ok(decision.message.length > 0, entity);
  }
  // Bahkan dengan fakta paling bersih tetap ditolak.
  assert.equal(
    decidePermanentDelete('branch', { isActive: false }).reason,
    'archive_only'
  );
  assert.equal(decidePermanentDelete('user', { isActive: false }).reason, 'archive_only');
});

// ============================================================
// Hapus permanen: konfigurasi
// ============================================================

test('konfigurasi aktif tidak bisa dihapus sebelum diarsipkan', () => {
  for (const entity of [
    'shift',
    'sop_category',
    'checklist_point',
    'handover_field',
    'incident_category',
  ] as const) {
    const decision = decidePermanentDelete(entity, { isActive: true });
    assert.equal(decision.allowed, false, entity);
    assert.equal(decision.status, 409, entity);
    assert.equal(decision.reason, 'not_archived', entity);
    assert.match(decision.message, /Arsipkan/i, entity);
  }
});

test('status arsip yang tidak diketahui ditolak (fail closed)', () => {
  const decision = decidePermanentDelete('shift', {});
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'not_archived');
});

test('konfigurasi arsip tanpa dependensi boleh dihapus permanen', () => {
  assert.equal(decidePermanentDelete('shift', { isActive: false }).allowed, true);
  assert.equal(decidePermanentDelete('sop_category', { isActive: false }).allowed, true);
  assert.equal(
    decidePermanentDelete('checklist_point', { isActive: false, parentVerified: true }).allowed,
    true
  );
  assert.equal(
    decidePermanentDelete('handover_field', { isActive: false, parentVerified: true }).allowed,
    true
  );
  assert.equal(decidePermanentDelete('incident_category', { isActive: false }).allowed, true);
});

test('objek dengan shift historis ditolak', () => {
  const decision = decidePermanentDelete('shift', {
    isActive: false,
    hasShiftHistory: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 409);
  assert.equal(decision.reason, 'has_shift_history');
  assert.match(decision.message, /Nonaktifkan saja/);
});

test('kategori SOP dengan item checklist ditolak', () => {
  const decision = decidePermanentDelete('sop_category', {
    isActive: false,
    hasChildren: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'has_children');
  assert.match(decision.message, /checklist point/);
});

test('shift dengan konfigurasi turunan ditolak', () => {
  const decision = decidePermanentDelete('shift', {
    isActive: false,
    hasChildren: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'has_children');
  assert.match(decision.message, /kategori SOP dan bidang handover/);
});

test('point yang direferensikan entry historis ditolak', () => {
  const decision = decidePermanentDelete('checklist_point', {
    isActive: false,
    parentVerified: true,
    hasEntryRefs: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'has_entry_refs');
});

test('kategori incident yang sudah dipakai ditolak', () => {
  const decision = decidePermanentDelete('incident_category', {
    isActive: false,
    inUse: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'in_use');
});

test('induk yang gagal diverifikasi ditolak walau selebihnya bersih', () => {
  const point = decidePermanentDelete('checklist_point', {
    isActive: false,
    parentVerified: false,
  });
  assert.equal(point.allowed, false);
  assert.equal(point.reason, 'parent_unverified');
  assert.match(point.message, /tidak dapat diverifikasi/);

  const field = decidePermanentDelete('handover_field', {
    isActive: false,
    parentVerified: false,
  });
  assert.equal(field.allowed, false);
  assert.equal(field.reason, 'parent_unverified');
});

test('urutan pemeriksaan: arsip dulu, baru dependensi', () => {
  // Objek aktif yang punya histori tetap ditolak dengan pesan "arsipkan dulu",
  // supaya langkah perbaikan yang ditampilkan ke admin jelas.
  const decision = decidePermanentDelete('shift', {
    isActive: true,
    hasShiftHistory: true,
    hasChildren: true,
  });
  assert.equal(decision.reason, 'not_archived');
});

test('canDeleteConfig mencerminkan keputusan yang sama', () => {
  assert.equal(canDeleteConfig('shift', { isActive: false }), true);
  assert.equal(canDeleteConfig('shift', { isActive: true }), false);
  assert.equal(canDeleteConfig('shift', { isActive: false, hasChildren: true }), false);
});

test('deletionBlockReason memberi alasan singkat tanpa pesan panjang', () => {
  assert.equal(deletionBlockReason('shift', { isActive: true }), 'not_archived');
  assert.equal(deletionBlockReason('shift', { isActive: false }), 'ok');
  assert.equal(
    deletionBlockReason('incident_category', { isActive: false, inUse: true }),
    'in_use'
  );
});

test('setiap penolakan punya pesan yang bisa ditampilkan ke pengguna', () => {
  const cases = [
    decidePermanentDelete('branch'),
    decidePermanentDelete('user'),
    decidePermanentDelete('shift', { isActive: true }),
    decidePermanentDelete('shift', { isActive: false, hasShiftHistory: true }),
    decidePermanentDelete('shift', { isActive: false, hasChildren: true }),
    decidePermanentDelete('sop_category', { isActive: false, hasChildren: true }),
    decidePermanentDelete('checklist_point', {
      isActive: false,
      parentVerified: false,
    }),
    decidePermanentDelete('checklist_point', { isActive: false, hasEntryRefs: true }),
    decidePermanentDelete('incident_category', { isActive: false, inUse: true }),
  ];

  for (const decision of cases) {
    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 409);
    assert.ok(decision.message.trim().length > 0, decision.reason);
  }
});