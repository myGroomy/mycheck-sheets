// lib/template-snapshot.ts
// Pembaca `template_snapshot` yang menghormati kolom `snapshot_encoding`.
//
// MASALAH YANG DISELESAIKAN
// Sheet menyimpan snapshot dalam DUA format, karena ada satu periode di mana
// proses eksternal menulis gzip:
//
//   snapshot_encoding='json'      -> template_snapshot = '{"v":1,...}'      (368 baris)
//   snapshot_encoding='gzip_b64'  -> template_snapshot = 'H4sIAAAAAAAAA...'   (49 baris)
//
// Semua pembaca sebelumnya memakai `JSON.parse` buta. Untuk baris gzip_b64 itu
// parse melempar, dan `catch` yang ada mengembalikan `null` — bukan error yang
// terlihat, melainkan checklist kosong di laporan. Beberapa endpoint lebih parah
// lagi: `entries`/`close`/`handover`/`progress` mengembalikan HTTP 500 sehingga
// shift tersebut praktis tidak bisa dipakai.
//
// FAKTA PENTING
// `gzip_b64` tidak pernah ditulis oleh kode repo ini — `git log --all -S
// 'gzip_b64'` nihil, dan shift terbaru semuanya 'json'. Jadi ini backward-
// compatibility, bukan migrasi ke depan. Kode TIDAK diubah untuk menulis gzip.
//
// DETEKSI
// Prioritas membaca `snapshot_encoding`. Kalau kolom itu kosong/tidak dikenal
// tapi isi kolom diawali `H4sI` (prefix gzip dalam base64), tetap dicoba gunzip
// — supaya baris yang kolomnya rusak masih bisa dibaca.

import { gunzipSync } from 'zlib';
import type { Snapshot } from './db/snapshot';
import { asStr } from './store';

/** Awalan base64 gzip: 'H4sI'. */
const GZIP_PREFIX = 'H4sI';

function isGzipBase64(raw: string): boolean {
  return raw.startsWith(GZIP_PREFIX);
}

/**
 * Decode satu nilai `template_snapshot`.
 *
 * @param raw     nilai mentah dari kolom `template_snapshot`
 * @param encoding nilai dari kolom `snapshot_encoding` (opsional)
 * @returns Snapshot, atau `null` bila kosong / tidak bisa dibaca.
 */
export function decodeTemplateSnapshot(raw: unknown, encoding?: unknown): Snapshot | null {
  const text = asStr(raw).trim();
  if (!text) return null;

  const enc = asStr(encoding).trim().toLowerCase();
  const looksGzip = enc === 'gzip_b64' || enc === 'gzip' || enc === 'gzip+base64' || isGzipBase64(text);

  let json = text;
  if (looksGzip) {
    try {
      json = gunzipSync(Buffer.from(text, 'base64')).toString('utf8');
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(json) as Snapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    // Snapshot lama bisa belum punya `categories`; normalkan supaya pemanggil
    // tidak perlu `?? []` di setiap tempat.
    return { ...parsed, categories: parsed.categories ?? [], handover_fields: parsed.handover_fields ?? [] };
  } catch {
    return null;
  }
}

/**
 * Baca `template_snapshot` langsung dari baris `ShiftInstances`.
 * Dipakai di semua endpoint yang butuh template shift.
 */
export function readTemplateSnapshot(instance: Record<string, unknown>): Snapshot | null {
  return decodeTemplateSnapshot(instance['template_snapshot'], instance['snapshot_encoding']);
}