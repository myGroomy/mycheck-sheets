# Catatan Historis Performa MyCheck

> **Dokumen historis dan superseded.** Naskah sebelumnya mencampur upgrade
> framework, tampilan loading, estimasi komparatif dengan STOKIS, serta tugas
> data yang statusnya berbeda-beda. Angka dan klaim parity di sana bukan hasil
> benchmark produksi.

## Keadaan saat ini

Optimasi pemuatan shift dan refresh checklist yang benar-benar dibuat
didokumentasikan dalam [`.PLAN/performa-mycheck.md`](../.PLAN/performa-mycheck.md).
Dokumen tersebut membedakan perubahan source yang terverifikasi dari latency
yang belum diukur.

Project saat ini menjalankan versi yang ada di `package.json` dan konfigurasi
`next.config.ts`; build menggunakan script `next build --webpack`, dev
menggunakan `next dev`, dan lint menggunakan Oxlint. Jangan menggunakan versi
paket, jumlah halaman build, atau status middleware dari snapshot historis di
naskah lama sebagai fakta sekarang.

## Batas bukti performa

- Perubahan seperti batching `ShiftDefinitions` + `ShiftInstances` mengurangi
  round-trip berdasarkan jalur source; itu bukan bukti p50/p95 end-to-end.
- Provider shift berbagi respons daftar shift; checklist accepted memakai
  respons aksi untuk menghindari GET progress penuh. Jalur ini perlu diuji
  dengan browser dan dua pengguna nyata.
- Belum tercatat pengukuran cold/warm production, kuota Sheets, ataupun
  benchmark terkontrol melawan STOKIS.

## Arahan

Gunakan `.PLAN/performa-mycheck.md` untuk implementasi yang telah dibuat dan
catat benchmark baru hanya setelah pengukuran dapat direproduksi. Hapus atau
perbarui dokumen historis bila benchmark aktual kelak tersedia.
