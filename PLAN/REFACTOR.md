# Catatan Historis Refactor MyCheck

> **Dokumen historis — bukan rencana kerja aktif.** Naskah lama berisi
> estimasi performa dan instruksi migrasi/cleanup yang tidak lagi cocok dengan
> repository. Instruksi shell lama (termasuk pemindahan/penghapusan folder)
> tidak boleh dijalankan sebagai runbook.

## Hasil arsitektur yang sekarang ada

Audit source 14 Oktober 2026 menunjukkan:

- Project adalah satu aplikasi Next.js App Router di root repository.
- Data utama tersimpan di Google Sheets: Registry dan spreadsheet per cabang.
- Foto disimpan di Google Drive.
- `lib/store.ts` / `lib/google/sheets.ts` menyediakan akses data, cache
  singkat, batching, serta penulisan `RAW`.
- Auth menggunakan PIN plaintext di Registry dan cookie HMAC stateless 7 hari.
- Tidak ada PostgreSQL, Supabase, Drizzle, monorepo `apps/web`, atau
  `packages/shared` sebagai arsitektur aktif.

Periksa `TRD.md`, `DATABASE_SCHEMA.md`, `ERD.md`, `AGENTS.md`, dan
`IMPLEMENTATION_PLAN.md` untuk penjelasan source-based yang lebih tepat.

## Apa yang tidak dibuktikan catatan lama

Estimasi latency lama seperti “100x login” atau “3–5x API response” adalah
estimasi/hipotesis, bukan benchmark terukur. Kesamaan framework atau jumlah
round-trip tidak membuktikan parity performa dengan STOKIS.

Migrasi ke Google Sheets mengubah failure mode: tidak ada transaksi, row lock,
unique constraint, atau revocation sesi server-side. Guard BR-01/BR-12 dan
operasi multi-sheet berada di kode aplikasi; uji integrasi tetap dibutuhkan.

## Tindak lanjut dokumentasi

- Jangan menjalankan perintah migration PostgreSQL/Supabase atau langkah
  restruktur monorepo yang pernah tertulis di naskah lama.
- Catatan perubahan implementasi dan batas pengukuran optimasi shift ada di
  `.PLAN/performa-mycheck.md`.
- Status fitur aktual dan gap requirement ada di `IMPLEMENTATION_PLAN.md`.
- Jangan menggunakan dokumen ini untuk mengklaim keamanan, akurasi data, atau
  peningkatan latency production.
