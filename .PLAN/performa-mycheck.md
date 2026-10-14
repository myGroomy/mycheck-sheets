# Rencana dan Laporan Optimasi Performa MyCheck

## Status

**Status: optimasi yang direncanakan sudah diimplementasikan dan build terverifikasi. Pengukuran runtime/cold-warm dan uji dua petugas belum dilakukan.**

Dokumen ini mencatat diagnosis awal, perubahan yang benar-benar dibuat, dan verifikasinya. Hasil latency production tidak diklaim karena belum ada pengukuran runtime.

## Tujuan produk yang tidak boleh berubah

MyCheck memastikan SOP tiap shift outlet dijalankan dan terdokumentasi. Petugas berkolaborasi mengisi checklist; aplikasi mencatat pelaku dan waktu, mengelola incident serta handover, dan menghasilkan laporan shift yang terkunci setelah penutupan.

Optimasi ini hanya memperbaiki cara data dimuat dan UI disinkronkan. Siklus shift, snapshot template, otorisasi cabang, idempotensi, aturan aksi bersama/konflik, audit trail, dan isi laporan harus tetap sama.

## Diagnosis awal dari source code

| Area | Temuan | Implikasi |
|---|---|---|
| Daftar shift | `CabangProvider` memuat `/api/shifts`, lalu `ShiftDashboardClient` juga memuat endpoint yang sama (`lib/CabangContext.tsx`, `components/shift/shift-dashboard.tsx`). | Potensi satu request endpoint ekstra pada navigasi ke daftar shift. |
| Endpoint daftar shift | `app/api/shifts/route.ts` membaca `ShiftDefinitions`, kemudian `ShiftInstances` secara serial per cabang. | Cold path berpotensi memerlukan dua round-trip Sheets berurutan per cabang. |
| Progress checklist | Komponen melakukan initial load, polling tiap 20 detik, refresh saat tab fokus/terlihat, dan fetch ulang setelah aksi. Endpoint progress membaca data shift, entries, users, serta participants. | Banyaknya round-trip dan pemindaian sheet dapat membuat refresh maupun aksi terasa lambat. Event fokus/visibility dapat memicu refresh berdekatan. |
| Pencarian instance | `lib/instance-resolver.ts` mencoba spreadsheet cabang satu per satu sampai menemukan ID shift. | Pengguna dengan akses ke banyak cabang dapat menambah latency pencarian. |
| Helper yang tersedia | `lib/google/sheets.ts` sudah memiliki cache TTL/single-flight dan `readSheetsBatch`; `lib/store.ts` menyediakan `filterRowsMulti`. | Optimasi dapat memakai pola yang ada, bukan menambah dependensi atau cache baru. |

Diagnosis di atas berasal dari inspeksi kode, bukan pengukuran production. Dampak aktual dan p50/p95 belum diketahui.

## Lingkup implementasi yang direncanakan

1. **Hapus fetch shift ganda.** Tetapkan satu pemilik pemuatan data untuk halaman daftar shift atau gunakan data yang sudah dimuat; pertahankan cabang dan shift yang ditampilkan.
2. **Batch pembacaan daftar shift.** Gunakan `readSheetsBatch` untuk dua sheet dari spreadsheet cabang yang sama. Proses cabang secara paralel dengan batas konkurensi yang sesuai untuk kuota Google Sheets.
3. **Kurangi pencarian instance lintas cabang.** Manfaatkan konteks cabang yang telah diketahui atau mekanisme indeks yang aman. Otorisasi tetap diverifikasi di server dan perilaku pemilihan instance tetap sama.
4. **Kurangi refresh checklist yang tidak perlu.** Setelah aksi berhasil, gunakan respons untuk memperbarui state lokal bila kontraknya cukup. Pertahankan fetch penuh untuk konflik, rekonsiliasi, atau penyegaran kolaboratif; gabungkan pemicu refresh yang berdekatan dan jangan polling tab tersembunyi.
5. **Instrumentasi dan evaluasi.** Ukur cold/warm sebelum dan sesudah, lalu putuskan target angka berdasarkan baseline, bukan asumsi.

## Metrik dan verifikasi

### Baseline yang perlu direkam sebelum perubahan

- Latency p50 dan p95 untuk `GET /api/shifts` dan `GET /api/shifts/[id]/progress`.
- Latency aksi checklist sampai UI menampilkan hasil yang tersinkron.
- Jumlah fetch browser ke `/api/shifts` dan endpoint progress per navigasi/aksi.
- Jumlah panggilan Sheets per endpoint dan jumlah cabang yang diakses.
- Hasil cold (cache miss) dibanding warm (cache hit), dengan ukuran data/cabang yang dicatat.

Belum ditentukan angka ambang penurunan latency. Setelah baseline tersedia, tim menetapkan target terukur dan mencatat perbandingan sebelum/sesudah di bagian hasil.

### Pemeriksaan perilaku

- Petugas hanya melihat cabang yang diizinkan; daftar/status shift cocok dengan data sumber.
- Definisi shift dan instance hari ini tetap terpasangkan benar, termasuk timezone dan status void/test.
- Pencarian shift mempertahankan pemilihan instance non-void yang berlaku dan fallback yang telah ada.
- Checklist tetap berfungsi untuk dua petugas; konflik aksi tetap menampilkan pemenang dan UI melakukan rekonsiliasi.
- Polling kolaboratif tetap berjalan saat halaman terlihat, tetapi tidak menghasilkan fetch ganda yang berdekatan.
- Jalankan `npm run lint`, `npm run typecheck`, `npm run build`, serta tes yang relevan. Bila belum tersedia tes otomatis untuk skenario kolaborasi, catat hasil uji manual dua akun.

## Area/file yang diperkirakan berubah

- `lib/CabangContext.tsx`
- `components/shift/shift-dashboard.tsx`
- `app/api/shifts/route.ts`
- `lib/instance-resolver.ts`
- `components/shift/shift-checklist.tsx`
- Tes terkait (sesuai pola tes yang tersedia)

Daftar ini perkiraan dan harus disesuaikan setelah pemeriksaan kontrak dan tes sebelum implementasi.

## Urutan pelaksanaan

1. Ukur dan catat baseline cold/warm.
2. Hilangkan fetch daftar shift ganda; verifikasi hasil dan akses.
3. Batch baca dua sheet per cabang dan terapkan konkurensi terbatas; ukur request/kuota.
4. Kurangi pencarian serial instance; verifikasi perilaku pemilihan dan otorisasi.
5. Optimalkan refresh progress tanpa mengurangi sinkronisasi lintas petugas.
6. Jalankan lint/typecheck/build dan uji perilaku, termasuk skenario dua pengguna.
7. Catat implementasi aktual, metrik sebelum/sesudah, hasil tes, serta batasan yang belum terverifikasi pada bagian di bawah.

## Hasil pengerjaan

### Fase 1 — Sumber data daftar shift bersama

**Selesai.** `CabangProvider` sekarang menyimpan cabang dan definisi/status shift dari satu respons `/api/shifts`; `ShiftDashboardClient` mengonsumsi context itu dan tidak lagi melakukan fetch daftar shift kedua saat mount. Kegagalan memuat data disampaikan ke tampilan daftar shift. Setelah aksi buka/gabung, provider meminta refresh sebelum navigasi.

Data context di-refresh jika berumur lebih dari 30 detik saat dashboard dibuka kembali; aksi dan penutupan shift memaksa refresh dengan cache browser dilewati agar status tidak tertahan oleh `max-age` respons. File diubah: `lib/CabangContext.tsx`, `components/shift/shift-dashboard.tsx`, `components/shift/shift-checklist.tsx`.

Verifikasi fase:

- [Lulus] Oxlint pada provider dan dashboard; semua file yang disentuh juga lulus lint akhir.
- [Lulus] `tsc --noEmit`.
- [Lulus] `git diff --check`.
- [Belum diukur] P50/p95 dan request aktual browser/Sheets; belum ada pengukuran runtime terhadap deployment.
- [Belum diuji manual] Refresh status ketika kembali dari alur tutup shift dan kolaborasi lintas petugas.

| Item | Hasil aktual |
|---|---|
| File/kode yang diubah | Fase 1: provider membagikan data shift; dashboard memakai data provider |
| Metrik baseline dan sesudah | Belum diukur |
| Lint / typecheck / build | Oxlint dan typecheck lulus; build akhir menyusul setelah semua fase |
| Uji perilaku (termasuk dua pengguna) | Belum dijalankan |
| Batasan atau risiko tersisa | Perubahan yang dibuat pengguna lain dapat tertahan sampai context di-refresh (maksimal 30 detik); belum diuji runtime |

### Fase 2 — Batch pembacaan sheet daftar shift

**Selesai.** Endpoint kini memakai `filterRowsMulti`/`values.batchGet` untuk membaca `ShiftDefinitions` dan `ShiftInstances` dalam satu request Sheets per cabang, bukan dua pembacaan serial. Pembacaan beberapa cabang dijalankan per kelompok maksimal tiga spreadsheet sekaligus. Filter status aktif, tanggal lokal cabang, void dan test tetap sama.

File diubah: `app/api/shifts/route.ts`.

Verifikasi fase:

- [Lulus] Oxlint untuk endpoint.
- [Lulus] `tsc --noEmit`.
- [Lulus] `git diff --check`.
- [Belum diukur] Latency production dan quota usage; optimasi round-trip diverifikasi dari jalur helper di source, bukan tracing runtime.
- [Belum diuji] Perbandingan hasil fixture multi-cabang dan kegagalan Sheets saat batch; pengujian akhir menyusul.

| Item | Hasil aktual |
|---|---|
| File/kode yang diubah | Fase 1: `lib/CabangContext.tsx`, `components/shift/shift-dashboard.tsx`; Fase 2: `app/api/shifts/route.ts` |
| Metrik baseline dan sesudah | Belum diukur; secara statis pembacaan per cabang berkurang dari dua `values.get` serial menjadi satu `batchGet`, dan maksimal tiga cabang dibaca paralel |
| Lint / typecheck / build | Oxlint dua fase dan typecheck lulus; build akhir menyusul |
| Uji perilaku (termasuk dua pengguna) | Belum dijalankan |
| Batasan atau risiko tersisa | Belum ada pengujian runtime multi-cabang/kuota; perubahan lintas petugas masih harus diuji setelah fase refresh |

### Fase 3 — Pencarian instance lintas cabang

**Selesai.** `resolveInstance` kini mencari pada kelompok maksimal tiga cabang paralel, bukan membaca spreadsheet satu per satu secara serial. Urutan cabang semula tetap dipakai untuk memilih hasil pertama yang cocok; dalam setiap spreadsheet, aturan memilih baris non-void terakhir (atau baris terakhir bila semuanya void) tetap dipertahankan. Kegagalan satu spreadsheet tetap dilewati seperti sebelumnya.

File diubah: `lib/instance-resolver.ts`.

Verifikasi fase:

- [Lulus] Oxlint untuk resolver.
- [Lulus] `tsc --noEmit`.
- [Lulus] `git diff --check`.
- [Belum diukur] Latency dan konsumsi kuota runtime; jalur pencarian kini membatasi concurrency tiga cabang.
- [Belum diuji manual] Pencarian multi-cabang, cabang dengan sheet gagal, serta ID duplikat antar spreadsheet.

| Item | Hasil aktual |
|---|---|
| File/kode yang diubah | Fase 1: context/dashboard/checklist close refresh; Fase 2: API shift; Fase 3: resolver |
| Metrik baseline dan sesudah | Belum diukur; secara statis lookup menunggu per kelompok hingga tiga cabang alih-alih satu cabang per putaran |
| Lint / typecheck / build | Oxlint dan typecheck lulus untuk fase; build akhir menyusul |
| Uji perilaku (termasuk dua pengguna) | Belum dijalankan |
| Batasan atau risiko tersisa | Bila ID yang sama muncul di cabang berbeda dalam satu kelompok, hasil pertama mengikuti urutan `ctx.branchIds` seperti semula; belum divalidasi dengan data runtime |

### Fase 4 — Refresh progress checklist

**Selesai.** Refresh akibat polling, focus, dan perubahan visibility kini digabung melalui debounce, tab tersembunyi tidak melakukan polling, dan request progress yang masih berjalan dipakai bersama. Respons aksi checklist yang diterima kini menyertakan nilai entry tersimpan dan ringkasan peserta; klien memperbarui entry, progress counter, serta peserta secara lokal alih-alih membaca progress penuh sesudah setiap aksi. Konflik BR-12 tetap memicu refresh penuh; respons duplikat juga memakai refresh untuk rekonsiliasi. Tombol “Saya bertugas” dan penutupan shift tetap menjalankan refresh penuh.

File diubah: `components/shift/shift-checklist.tsx`, `app/api/shifts/[id]/entries/route.ts`.

Verifikasi fase:

- [Lulus] Oxlint untuk komponen, route aksi, dan halaman shift.
- [Lulus] `tsc --noEmit`.
- [Lulus] `git diff --check`.
- [Belum diuji manual] Dua pengguna menyelesaikan item yang sama, perubahan peserta oleh pengguna lain, reset item, dan aksi idempoten/duplikat.
- [Belum diukur] End-to-end latency dan jumlah request runtime.

| Item | Hasil aktual |
|---|---|
| File/kode yang diubah | Fase 1–4: shared shift data, batch API shift, lookup resolver, optimisme checklist |
| Metrik baseline dan sesudah | Belum diukur; pada aksi accepted, klien tidak lagi meminta GET progress penuh. Polling kolaboratif tetap 20 detik saat halaman terlihat |
| Lint / typecheck / build | Oxlint dan typecheck lulus untuk perubahan sampai fase ini; full build menyusul |
| Uji perilaku (termasuk dua pengguna) | Belum dijalankan |
| Batasan atau risiko tersisa | Pembaruan pengguna lain tampak saat polling/refresh berikutnya; validasi interaksi BR-12 dan state optimistis butuh uji perilaku |

### Fase 5 — Validasi akhir dan laporan

**Selesai.** Pemeriksaan proyek dan build produksi berhasil. `npm run lint` selesai exit 0 dengan warnings yang tidak berasal dari file yang diubah. Build mengompilasi dan menyelesaikan 55/55 static page generation; ada warning konfigurasi tracing workspace dan dua warning pseudo-element `::highlight` dari CSS dependency. Tidak ada tes otomatis khusus untuk alur dua petugas, dan tidak dilakukan uji manual terhadap spreadsheet runtime.

Pengukuran p50/p95, cold/warm, panggilan Sheets dan jumlah request produksi **belum tersedia**. Klaim dampak yang dapat dibuat hanya struktural: satu fetch `/api/shifts` pada halaman daftar (provider menjadi sumber tunggal); satu `batchGet` untuk dua sheet per cabang; maksimal tiga cabang dibaca paralel; pencarian instance maksimal tiga cabang paralel per gelombang; dan aksi checklist accepted tidak lagi meminta GET progress penuh. Ini belum membuktikan angka pengurangan latency end-to-end.

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | Lulus (exit 0); warnings yang terlapor tidak berasal dari file yang diubah |
| `npm run typecheck` | Lulus |
| `npm run build` | Lulus; 55/55 static page generation selesai |
| `git diff --check` | Lulus |
| Tes perilaku dua petugas / integrasi Google Sheets | Belum dijalankan |
| Pengukuran baseline vs sesudah | Belum dilakukan; p50/p95 tidak diklaim |

| Item | Hasil aktual |
|---|---|
| File/kode yang diubah | `lib/CabangContext.tsx`, `components/shift/shift-dashboard.tsx`, `components/shift/shift-checklist.tsx`, `app/api/shifts/route.ts`, `lib/instance-resolver.ts`, `app/api/shifts/[id]/entries/route.ts` |
| Metrik baseline dan sesudah | Belum diukur; perlu uji runtime dengan cabang/data yang representatif |
| Lint / typecheck / build | Semua lulus; lihat catatan warning di atas |
| Uji perilaku (termasuk dua pengguna) | Belum dijalankan |
| Batasan atau risiko tersisa | Efek latency nyata, kuota Sheets, interaksi konkurensi dan rekonsiliasi belum diverifikasi di runtime |
