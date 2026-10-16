// tests/superuser-role.test.ts
// Mengunci kontrak model role: "admin = petugas + privilege".
//
// Phase 2 menghapus blokir halaman yang menutup jalur petugas dari admin.
// Kontrak itu hanya sah kalau dua sisi-duanya benar:
//
//   1. Admin MELEWATI setiap gate petugas  (requireRole(ctx,'petugas')).
//   2. Petugas TETAP TIDAK bisa memakai privilege admin.
//
// Sisi (1) diuji sebagai unit test pada helper auth — cepat dan deterministik,
// tanpa I/O. Sisi (2) diuji lewat route admin sungguhan supaya tidak hanya
// menguji stub.

import test from 'node:test';
import assert from 'node:assert/strict';

// WAJIB diimpor paling awal: helper ini memasang env minimal dan fake Sheets
// client. `lib/api-auth` → `lib/session` memvalidasi env saat di-load, jadi
// modul ini harus aktif sebelum `lib/api-auth` dievaluasi.
import './helpers/mock-registry';

// Import TIPE saja — dihapus saat kompilasi, jadi tidak memuat modul apa pun.
// Nilai api-auth sengaja TIDAK di-import statis (lihat `auth()` di bawah).
import type { AuthContext } from '../lib/api-auth';
import { installSessionStub } from './helpers/mock-auth';

installSessionStub();

/**
 * Import dinamis yang di-memoisasi.
 *
 * Import statis akan dievaluasi lebih dulu (hoisting) dan membinding
 * `getSessionFromRequest` yang ASLI, sehingga stub di atas tidak pernah dipakai
 * dan setiap route melihat sesi kosong. Import harus terjadi setelah
 * `installSessionStub()`. Top-level await tidak bisa dipakai karena tsx
 * mentransformasi file ini ke CJS, jadi ditunda ke dalam fungsi.
 */
let cached: typeof import('../lib/api-auth') | null = null;
async function auth() {
  if (!cached) cached = await import('../lib/api-auth');
  return cached;
}

function ctx(role: 'admin' | 'petugas', branchIds: string[]): AuthContext {
  return {
    user: {
      id: `${role}1`,
      name: role === 'admin' ? 'Admin Uji' : 'Petugas Uji',
      username: `${role}1`,
      role,
      mustChangePin: false,
      isActive: true,
    },
    branchIds,
    cabangId: branchIds.join(','),
  };
}

// --- Sisi 1: admin adalah petugas-plus -------------------------------------

test('admin MELEWATI gate role petugas', async () => {
  const { requireRole } = await auth();
  assert.equal(requireRole(ctx('admin', ['CAB1']), 'petugas'), null);
});

test('admin MELEWATI akses cabang (fungsi pengawasan tetap utuh)', async () => {
  const { requireBranchAccess } = await auth();
  // Admin punya seluruh cabang. Ini sudah berlaku sejak awal dan Phase 2 tidak
  // boleh mengubahnya — privileges di Phase 1 hanya mengetatkan jalur TULIS.
  assert.equal(requireBranchAccess(ctx('admin', ['CAB1', 'CAB2']), 'CAB2'), null);
});

// --- Sisi 2: privilege tetap eksklusif admin --------------------------------

test('petugas DITOLAK gate role admin', async () => {
  const { requireRole } = await auth();
  const res = requireRole(ctx('petugas', ['CAB1']), 'admin');
  assert.ok(res, 'harus mengembalikan NextResponse');
  assert.equal(res!.status, 403);
});

test('petugas DITOLAK akses ke luar cabangnya', async () => {
  const { requireBranchAccess } = await auth();
  const res = requireBranchAccess(ctx('petugas', ['CAB1']), 'CAB2');
  assert.ok(res);
  assert.equal(res!.status, 403);
});

test('petugas BOLEH akses cabangnya sendiri', async () => {
  const { requireBranchAccess } = await auth();
  assert.equal(requireBranchAccess(ctx('petugas', ['CAB1', 'CAB2']), 'CAB2'), null);
});

// --- Batas privilege di level route ----------------------------------------

test('route admin menolak petugas (403) dan menerima admin (bukan 403)', async () => {
  const { setSession, clearSession, makeRequest } = await import('./helpers/mock-auth');
  const { seedRegistry, resetRegistryCache, REGISTRY_SPREADSHEET_ID } = await import('./helpers/mock-registry');
  const { addSheet } = await import('./helpers/mock-sheets');

  const workbook = seedRegistry([]);
  // Audit log sudahkan nama pelaku dari sheet Users; tanpa ini route gagal
  // membaca data — bukan karena gerbang role, sehingga test-nya jadi kabur.
  addSheet(
    workbook,
    'Users',
    ['User_ID', 'Username', 'Nama', 'Role', 'Cabang_ID', 'Aktif', 'Dibuat_Pada'],
    [
      { User_ID: 'admin1', Username: 'admin1', Nama: 'Admin Uji', Role: 'admin', Cabang_ID: '', Aktif: true, Dibuat_Pada: '2026-01-01' },
      { User_ID: 'petugas1', Username: 'petugas1', Nama: 'Petugas Uji', Role: 'petugas', Cabang_ID: 'CAB1', Aktif: true, Dibuat_Pada: '2026-01-01' },
    ],
    REGISTRY_SPREADSHEET_ID
  );
  resetRegistryCache();

  const { GET } = await import('../app/api/admin/audit-log/route');

  setSession({ username: 'petugas1', nama: 'Petugas Uji', role: 'petugas', cabangId: 'CAB1' });
  const denied = await GET(makeRequest('GET', 'http://localhost:3000/api/admin/audit-log'));
  clearSession();
  assert.equal(denied.status, 403);

  setSession({ username: 'admin1', nama: 'Admin Uji', role: 'admin', cabangId: '' });
  const allowed = await GET(makeRequest('GET', 'http://localhost:3000/api/admin/audit-log'));
  clearSession();
  // Admin tidak boleh kena 403. Status bisa apa saja selain itu — yang diuji
  // adalah gerbang role, bukan isi respons.
  assert.notEqual(allowed.status, 403);
});