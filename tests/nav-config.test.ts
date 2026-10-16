// tests/nav-config.test.ts
// Mengunci struktur navigasi setelah restrukturisasi Phase 5.
//
// Nav adalah konfigurasi murni, jadi tanpa test tidak ada yang mencegah
// perubahan tidak sengaja: href berpindah, alias hilang, atau ikon dobel
// muncul kembali. Test di sini sengaja spesifik pada keputusan yang diambil,
// bukan pada jumlah baris.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOBILE_CORE_LIMIT,
  getMobileCoreItems,
  getMobileMoreGroups,
  getNavGroups,
  isNavItemActive,
} from '../lib/nav-config';
import type { NavItem } from '../lib/nav-config';

// --- Struktur grup ---------------------------------------------------------

test('admin punya 5 grup dengan urutan yang diharapkan', () => {
  const groups = getNavGroups('admin');
  assert.deepEqual(
    groups.map((g) => g.title),
    ['Harian', 'Operasional', 'Konfigurasi', 'Administrasi', 'Bantuan']
  );
});

test('petugas tetap 2 grup dan itemnya tidak berubah', () => {
  const groups = getNavGroups('petugas');
  assert.deepEqual(
    groups.map((g) => g.title),
    ['Utama', 'Bantuan']
  );
  assert.deepEqual(
    groups[0].items.map((i) => i.name),
    ['Checklist', 'Handover', 'Incident', 'Laporan']
  );
});

// --- Parity admin <-> petugas ---------------------------------------------

test('grup Harian admin memuat 4 item parity dengan petugas', () => {
  const harian = getNavGroups('admin')[0];
  assert.equal(harian.items.length, MOBILE_CORE_LIMIT);
  assert.deepEqual(
    harian.items.map((i) => i.name),
    ['Shift Saya', 'Incident', 'Checklist / SOP', 'Handover']
  );
});

test('admin Incident menunjuk ke halaman terpadu, bukan halaman terpisah', () => {
  const incident = getNavGroups('admin')[0].items.find((i) => i.name === 'Incident')!;
  assert.equal(incident.href, '/admin/incident');
  assert.deepEqual(incident.aliases, ['/admin/incident/kategori']);
});

test('alias sub-tab builder ikut aktif di nav', () => {
  const harian = getNavGroups('admin')[0];
  const cases: Array<[string, string]> = [
    ['Incident', '/admin/incident/kategori'],
    ['Checklist / SOP', '/admin/checklist/builder'],
    ['Handover', '/admin/handover/builder'],
  ];
  for (const [name, subPath] of cases) {
    const item = harian.items.find((i) => i.name === name)!;
    assert.ok(item, `${name} harus ada`);
    assert.ok(
      isNavItemActive(item, subPath),
      `${name} harus aktif di ${subPath}`
    );
  }
});

// --- Tabrakan ikon ---------------------------------------------------------

function iconsOf(role: 'admin' | 'petugas'): string[] {
  return getNavGroups(role)
    .flatMap((g) => g.items)
    .map((i) => i.icon.displayName ?? String(i.icon));
}

test('tidak ada ikon dobel dalam nav admin', () => {
  const icons = iconsOf('admin');
  assert.equal(new Set(icons).size, icons.length, `ikon dobel: ${icons.join(', ')}`);
});

test('tidak ada ikon dobel dalam nav petugas', () => {
  const icons = iconsOf('petugas');
  assert.equal(new Set(icons).size, icons.length, `ikon dobel: ${icons.join(', ')}`);
});

test('Handover memakai ArrowLeftRight, Laporan tetap FileText', () => {
  const harian = getNavGroups('admin')[0];
  const handover = harian.items.find((i) => i.name === 'Handover')!;
  const laporan = getNavGroups('admin')[1].items.find((i) => i.name === 'Laporan')!;
  assert.equal(handover.icon.displayName, 'ArrowLeftRight');
  assert.equal(laporan.icon.displayName, 'FileText');
});

// --- Mobile ----------------------------------------------------------------

test('mobile core admin = 4 item Harian', () => {
  const core = getMobileCoreItems('admin');
  assert.equal(core.length, MOBILE_CORE_LIMIT);
  assert.deepEqual(
    core.map((i) => i.name),
    ['Shift Saya', 'Incident', 'Checklist / SOP', 'Handover']
  );
});

test('mobile core petugas tidak berubah', () => {
  const core = getMobileCoreItems('petugas');
  assert.equal(core.length, MOBILE_CORE_LIMIT);
  assert.deepEqual(
    core.map((i) => i.name),
    ['Checklist', 'Handover', 'Incident', 'Laporan']
  );
});

test('drawer "Lainnya" admin berisi sisa grup', () => {
  const more = getMobileMoreGroups('admin');
  const titles = more.map((g) => g.title);
  assert.ok(titles.includes('Operasional'));
  assert.ok(titles.includes('Konfigurasi'));
  assert.ok(titles.includes('Administrasi'));
  assert.ok(titles.includes('Bantuan'));
  // Harian tidak boleh ikut ke drawer (sudah penuh di bottom bar).
  assert.ok(!titles.includes('Harian'));
});

// --- Item yang dihapus dari nav -------------------------------------------

test('tidak ada entri nav terpisah untuk builder', () => {
  // Prinsip Phase 3-4: builder jadi tab di dalam halaman, bukan entri nav.
  const all: NavItem[] = getNavGroups('admin').flatMap((g) => g.items);
  assert.ok(!all.some((i) => i.href === '/admin/checklist-builder'));
  assert.ok(!all.some((i) => i.href === '/admin/kategori-incident'));
  assert.ok(!all.some((i) => i.href === '/admin/handover-builder'));
});
