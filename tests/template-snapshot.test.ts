// tests/template-snapshot.test.ts
// Uji lib/template-snapshot.ts: pembaca snapshot yang menghormati
// `snapshot_encoding`.
//
// Konteks: sheet menyimpan `template_snapshot` dalam dua format karena ada
// satu periode (±11 jam, 3–4 Okt 2026) di mana proses eksternal menulis gzip.
// Pembaca lama memakai `JSON.parse` buta, sehingga 49 baris gzip jadi `null`:
//   - laporan  -> `categories: []` -> checklist kosong (tidak ada error)
//   - endpoints shift -> HTTP 500 (entries/close/handover/progress/upload)
//
// Test ini membangkitkan fixture gzip sendiri, bukan menyalin string base64
// panjang dari sheet, supaya file tetap enak dibaca dan diff-nya kecil.

import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'zlib';

import { decodeTemplateSnapshot, readTemplateSnapshot } from '../lib/template-snapshot';
import type { Snapshot } from '../lib/db/snapshot';

function makeSnapshot(): Snapshot {
  return {
    v: 1,
    shift: { id: 'SD1', name: 'T1f5-Opening', start_time: '07:00', end_time: '15:00', crosses_midnight: false },
    settings: { tolerance_default_minutes: 15, timezone: 'Asia/Jakarta' },
    categories: [
      {
        id: 'C1',
        name: 'T1f5-Kebersihan',
        sort_order: 1,
        points: [
          {
            point_ref: 'P1',
            title: 'Lantai ruang tamu',
            instruction: null,
            input_type: 'boolean',
            is_required: true,
            target_time: '08:00',
            tolerance_minutes: 15,
            active_days: null,
            number_min: null,
            number_max: null,
            sort_order: 1,
          },
          {
            point_ref: 'P2',
            title: 'Catat jumlah tamu',
            instruction: null,
            input_type: 'number',
            is_required: false,
            target_time: null,
            tolerance_minutes: null,
            active_days: null,
            number_min: 0,
            number_max: 500,
            sort_order: 2,
          },
        ],
      },
    ],
    handover_fields: [
      { id: 'H1', label: 'Jumlah kamar terisi', field_type: 'number', is_required: true, sort_order: 1 },
    ],
  } as Snapshot;
}

/** Base64 gzip dari snapshot di atas; selalu berawalan `H4sI`. */
function toGzipB64(snap: Snapshot): string {
  return gzipSync(Buffer.from(JSON.stringify(snap), 'utf8')).toString('base64');
}

const SNAPSHOT = makeSnapshot();
const PLAIN_JSON = JSON.stringify(SNAPSHOT);
const GZIP_B64 = toGzipB64(SNAPSHOT);

// ── json (jalur utama, 368 baris di sheet) ─────────────────────────────

test('decode: JSON biasa dengan encoding "json"', () => {
  const snap = decodeTemplateSnapshot(PLAIN_JSON, 'json');
  assert.ok(snap);
  assert.equal(snap.categories.length, 1);
  assert.equal(snap.categories[0].points.length, 2);
});

test('decode: JSON biasa tanpa kolom encoding (defaultSheet lama)', () => {
  const snap = decodeTemplateSnapshot(PLAIN_JSON);
  assert.ok(snap);
  assert.equal(snap.categories[0].name, 'T1f5-Kebersihan');
});

// ── gzip_b64 (jalur yang rusak, 49 baris) ──────────────────────────────

test('decode: gzip+base64 dengan encoding "gzip_b64" — regresi utama', () => {
  assert.ok(GZIP_B64.startsWith('H4sI'), 'fixture harus terdeteksi sebagai gzip base64');
  const snap = decodeTemplateSnapshot(GZIP_B64, 'gzip_b64');
  assert.ok(snap, 'gzip harus berhasil didecode, bukan null');
  assert.equal(snap.categories.length, 1);
  assert.equal(snap.categories[0].points.length, 2);
  assert.equal(snap.handover_fields.length, 1);
});

test('decode: gzip terdeteksi dari prefix walau kolom encoding rusak/kosong', () => {
  // Kolom encoding hilang atau salah tulis, tapi isi kolom tetap gzip.
  assert.ok(decodeTemplateSnapshot(GZIP_B64, undefined));
  assert.ok(decodeTemplateSnapshot(GZIP_B64, ''));
  assert.ok(decodeTemplateSnapshot(GZIP_B64, 'JSON')); // nilai tidak dikenal
});

test('decode: kedua encoding menghasilkan snapshot yang identik', () => {
  const a = decodeTemplateSnapshot(PLAIN_JSON, 'json');
  const b = decodeTemplateSnapshot(GZIP_B64, 'gzip_b64');
  assert.deepEqual(a, b);
});

test('readTemplateSnapshot: baris gzip_b64 dari ShiftInstances', () => {
  const instance = { template_snapshot: GZIP_B64, snapshot_encoding: 'gzip_b64' };
  const snap = readTemplateSnapshot(instance);
  assert.ok(snap, 'regresi: baris gzip harus terbaca dari baris instance');
  assert.equal(snap.categories[0].points[0].point_ref, 'P1');
});

test('readTemplateSnapshot: baris json tidak berubah perilakunya', () => {
  const snap = readTemplateSnapshot({ template_snapshot: PLAIN_JSON, snapshot_encoding: 'json' });
  assert.ok(snap);
  assert.equal(snap.shift.name, 'T1f5-Opening');
});

// ── kondisi gagal → null, bukan exception ──────────────────────────────

test('decode: base64 rusak pada kolom gzip → null (bukan lempar)', () => {
  assert.equal(decodeTemplateSnapshot('H4sIAAAAJUNK', 'gzip_b64'), null);
});

test('decode: JSON rusak → null', () => {
  assert.equal(decodeTemplateSnapshot('{bukan json', 'json'), null);
});

test('decode: nilai kosong / null / undefined → null', () => {
  assert.equal(decodeTemplateSnapshot(null), null);
  assert.equal(decodeTemplateSnapshot(undefined), null);
  assert.equal(decodeTemplateSnapshot(''), null);
  assert.equal(decodeTemplateSnapshot('   '), null);
});

test('decode: JSON primitive (bukan objek) → null', () => {
  assert.equal(decodeTemplateSnapshot('"hai"', 'json'), null);
  assert.equal(decodeTemplateSnapshot('123', 'json'), null);
  assert.equal(decodeTemplateSnapshot('null', 'json'), null);
});

// ── normalisasi bentuk ────────────────────────────────────────────────

test('decode: snapshot tanpa `categories` dinormalisasi jadi array kosong', () => {
  // Snapshot lawas mungkin belum punya categories; pemanggil tidak boleh
  // wajib menulis `?? []` di setiap tempat.
  const snap = decodeTemplateSnapshot(JSON.stringify({ v: 1, shift: { name: 'lama' } }), 'json');
  assert.ok(snap);
  assert.deepEqual(snap.categories, []);
  assert.deepEqual(snap.handover_fields, []);
});

test('readTemplateSnapshot: instance tanpa kolom snapshot → null', () => {
  assert.equal(readTemplateSnapshot({}), null);
});
