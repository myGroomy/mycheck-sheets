# Implementation Status MyCheck

**Audit source:** repository code inspected 14 Oktober 2026.
**Tujuan:** menggantikan daftar fase lama yang berisi stack PostgreSQL dan
status centang yang tidak konsisten. Tabel ini melaporkan keberadaan jalur di
source, bukan hasil uji penerimaan/production.

## Arti status

- **Ada di source** — terdapat route/komponen/helper yang membentuk jalur
  tersebut; belum berarti skenario sudah diuji menyeluruh.
- **Parsial / perlu verifikasi** — sebagian alur ada, requirement lebih luas
  atau jaminan runtime-nya belum terpenuhi.
- **Tidak ditemukan** — pencarian route/config/source dalam repository tidak
  menemukan fitur yang disebut.

## Fitur utama

| Area | Status dari source | Bukti utama / batas |
|---|---|---|
| Login username + PIN, ganti PIN, cookie sesi | Ada di source, dengan gap keamanan | `app/api/auth/**`, `lib/session.ts`; PIN plaintext, expiry 7 hari, tanpa login lockout/rate limit. `logout-all` hanya menghapus cookie pemanggil. |
| Pengarahan perubahan PIN pertama/reset | Parsial | Flag `Must_Change_Pin` dan halaman `/ganti-pin` ada; `AuthGuard` tidak memaksa redirect berdasar flag. |
| Otorisasi role dan cabang | Parsial / route-specific | `lib/api-auth.ts`, `lib/page-auth.ts`, `proxy.ts`; verifikasi harus dilakukan per handler. |
| Daftar, buka/gabung, progress, penutupan shift | Ada di source | `/api/shifts/**`, `/shift/[id]`, dialog tutup. Operasi Sheets multi-langkah bukan transaksi. |
| Checklist kolaboratif, idempotensi, rekonsiliasi konflik | Ada di source, perlu uji konkurensi | `/api/shifts/[id]/entries`, `lib/concurrency.ts`, `components/shift/shift-checklist.tsx`; belum ada test dua pengguna. |
| Handover, ack, foto | Ada di source | `/api/shifts/[id]/handover*`, `/api/handovers/**`, `/api/photos/**`. |
| Incident dan catatan | Ada di source | `/api/incidents/**`, halaman incident petugas/admin. |
| Laporan, tautan publik, addendum | Ada di source | `/api/reports/**`, `/api/public/report/**`, route admin share/addenda. |
| Ekspor laporan | Parsial | Route `/api/admin/reports/[id]/export` menghasilkan CSV; PDF export tidak ditemukan. |
| Admin konfigurasi dan operasi shift | Ada di source; lifecycle arsip tersedia | Halaman cabang, akun, shift, checklist/SOP, handover, dan kategori incident memiliki filter Arsip/pulihkan. Konfigurasi hanya dapat dihapus permanen setelah diarsipkan dan lolos pemeriksaan server; cabang/akun arsip-only. Keputusan hapus terpusat di `lib/admin/lifecycle-policy.ts` dan diuji dengan `npm test`. Perilaku I/O Google Sheets belum diuji. |
| Dashboard dan statistik | Parsial | Dashboard dan `/api/admin/stats` tersedia; tidak semua metrik PRD/summary terjadwal ditemukan. |
| Audit log/hash chain | Parsial | Penulisan audit per tab bulanan tersedia. Tidak ditemukan verifier hash-chain terjadwal; `/api/cron/verify` hanya memvalidasi secret. |
| Notifikasi dalam aplikasi | Parsial | Endpoint baca/mark-read dan daftar notifikasi cabang ada; tidak membuktikan seluruh event/pref tersedia. |
| Web push | Tidak ditemukan | Tidak ditemukan route subscription, VAPID setup, atau sender. |
| PWA install dan status koneksi | Ada di source, terbatas | Manifest, install prompt, status online, service worker ada. Cache hanya app-shell assets terpilih. |
| Offline read cache / offline write queue | Tidak ditemukan | Tidak ada cache data API atau queue sinkronisasi. |
| Arsip foto otomatis ke PDF/Drive | Tidak ditemukan | Foto upload langsung ke Drive tersedia; tidak ditemukan pipeline arsip/purge. |
| Tes aplikasi otomatis | Tidak ditemukan | Tidak ada `test` script atau `*.test.*`/`*.spec.*` pada audit ini. Lint/typecheck/build tersedia. |

## Route UI aktif

- Petugas: `/daftar-shift`, `/shift/[id]`, `/incident`, `/incident/baru`,
  `/incident/[id]`, `/report`, `/report/[id]`.
- Admin: `/admin` serta halaman di bawah `/admin/` untuk akun, cabang, shift,
  builder, incident, operasi, laporan, pengaturan, audit.
- Publik: `/r/[token]`; dokumentasi: `/docs/**`.
- `/` melayani landing page untuk tamu dan redirect berbasis role; bukan
  dashboard petugas.

Daftar yang dihasilkan langsung dari source ada di `app/`. API method/payload
ada pada route handler, bukan di tabel status ini.

## Pemeriksaan yang tersedia

`package.json` menyediakan `npm run lint`, `npm run typecheck`, dan
`npm run build`. Lulusnya perintah ini hanya memastikan lint/type/build pada
kode; bukan uji Google Sheets runtime, akses cabang, integrasi Drive, atau
perilaku dua petugas.

Pada audit ini belum ada bukti:

- uji manual lintas dua akun/perangkat untuk BR-01, BR-12, handover, dan tutup;
- pengukuran p50/p95 atau penggunaan kuota Google API;
- uji browser responsif, screen reader, atau aksesibilitas menyeluruh;
- uji deployment production dan operasi scheduled jobs.

## Prioritas tindak lanjut

1. Tutup risiko login: jangan menyimpan PIN plaintext; tambahkan throttling
   serta mekanisme sesi yang benar-benar bisa dicabut. Ini membutuhkan desain
   dan perubahan kode, bukan sekadar dokumentasi.
2. Tambahkan test otomatis untuk peraturan inti dan route access; lengkapi
   dengan uji manual dua pengguna pada spreadsheet uji.
3. Putuskan apakah fitur offline, push, PDF/arsip foto, dan statistik penuh
   masih bagian dari target; tandai requirement yang dihapus atau buat fase
   implementasi baru setelah disetujui.
4. Jalankan verifier audit hanya jika implementasi dan jadwal benar-benar
   dibuat; endpoint secret-check saat ini bukan verifier.

Tidak ada perubahan pada kode aplikasi dalam pembaruan status ini.
