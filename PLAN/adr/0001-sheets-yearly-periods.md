# ADR 0001: Penyimpanan Flat dan Arsip Tahunan di Google Sheets

Status: diterapkan sebagian; mode flat ditetapkan untuk cabang baru

## Keputusan

Spreadsheet cabang tetap menjadi penyimpanan data. Periode aktif dibaca dari
`_meta.period_mode`. Cabang baru memakai mode `flat` dan menulis ke sheet
generik (`Base`); tahun disimpan pada kolom data dan diarsipkan manual ke
spreadsheet terpisah. Mode `monthly` dan `yearly` tetap dibaca untuk cabang
lama.

Sumber header, nama sheet, dan mode periode dipusatkan pada `lib/schema/registry.ts` dan
`lib/schema/periods.ts`. `PLAN/DATABASE_SCHEMA.md` adalah acuan dokumentasi;
ERD hanya turunan. Migrasi dan cleanup bersifat fail-closed, dry-run secara
default, dan membuat backup sebelum operasi destruktif.

Nama sheet, pembentukan periode, normalisasi, dan pembacaan versi dipusatkan di
`lib/schema/`. Import lama dari `lib/google/branch-schema.ts` tetap menjadi
re-export agar migrasi kode dapat dilakukan bertahap.

## Migrasi

Template baru dibuat dengan `scripts/generate-template.py` dan memiliki
`schema_version=2`, `period_mode=flat`, serta sheet transaksi generik.
Arsip tahunan dibuat terpisah setelah user memilih tahun; prosesnya harus
preview, backup, verifikasi ID, lalu baru menghapus baris dari sheet aktif
secara opsional.

## Alternatif

- Database relasional: ditunda sampai kriteria keluar di rencana terpenuhi.
- Dual-write flat dan periodik: ditolak karena memperbesar risiko duplikasi.
- Membuat sheet tahunan otomatis: ditolak karena template menjadi terikat
  tahun dan menambah kompleksitas operasional.

## Kriteria keluar

Pindah ke database relasional dievaluasi jika jumlah cabang, volume, batas sel,
reliabilitas indeks, atau kebutuhan transaksi memenuhi kriteria di bagian 11
`PLAN/refaktor-data.md`.
