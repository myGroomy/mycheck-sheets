# Audit dan Rencana Refaktor UI/UX MyCheck

> Status: RENCANA
> Arah: preserve + polish
> Prioritas: petugas operasional mobile, kemudian admin

## 1. Ringkasan Audit

- **Efisiensi saat ini: 7/10.** Alur utama sudah tersedia, tetapi konteks dan beberapa aksi masih tersebar.
- **Efektivitas: 7/10.** Status, loading, dan error cukup jelas, tetapi prioritas aksi belum selalu terlihat.
- **Style: 7/10.** Palet netral dan tipografi cukup konsisten, tetapi radius, shadow, ukuran container, komponen input, dan kontras teks masih bercampur.
- **Design read:** aplikasi operasional internal F&B dengan bahasa visual tenang, tepercaya, mobile-first, dan minim distraksi.
- **Design dial:** `DESIGN_VARIANCE 3`, `MOTION_INTENSITY 2`, `VISUAL_DENSITY 5`.

## 2. Temuan Utama

### Kekuatan

- Sidebar desktop, bottom navigation mobile, role-aware navigation, dan drawer mobile sudah memiliki fondasi yang baik.
- Palet stone/netral dan `Plus Jakarta Sans` sesuai untuk aplikasi operasional.
- Checklist sudah memakai optimistic update, refresh berkala, skeleton, dan feedback aksi.
- Sebagian besar form sudah memiliki label, error state, disabled state, dan loading state.
- Empty state dan responsive record card sudah tersedia pada beberapa area penting.

### Masalah UX

- Prioritas petugas belum cukup tegas: buka shift, checklist, handover, incident, dan laporan masih terasa sebagai halaman terpisah.
- Dashboard admin lebih informatif daripada actionable; metric belum cukup menjadi shortcut ke pekerjaan.
- Checklist belum memiliki status sinkronisasi/offline yang eksplisit.
- Filter incident admin cukup padat karena pengaturan dan filter tampil bersamaan sebelum data utama.
- Filter laporan dapat memicu request berulang saat input berubah.
- Sub-halaman builder dan detail belum selalu memiliki pola judul, breadcrumb, dan konteks yang seragam.

### Masalah visual

- Container halaman bercampur antara `max-w-3xl`, `max-w-4xl`, `max-w-6xl`, dan `max-w-7xl`.
- Radius bercampur antara `rounded-xl` dan `rounded-2xl`; shadow juga belum memiliki aturan tunggal.
- Input native `<select>` dan Radix Select digunakan bersamaan tanpa standardisasi visual yang jelas.
- Token `text-xs` menjadi 11px; `text-ink-light` berisiko terlalu rendah kontras untuk teks informasi.
- Status warna, badge, border, dan tombol masih memiliki beberapa variasi implementasi.
- Halaman login memakai bahasa visual gelap yang cukup berbeda dari aplikasi authenticated.

## 3. Arah Visual yang Dipilih

- Pertahankan palet netral, `Plus Jakarta Sans`, sidebar desktop, bottom navigation mobile, dan gaya sederhana.
- Gunakan satu bahasa komponen: halaman/card `rounded-xl`, dialog `rounded-xl`, tombol/input `rounded-md`.
- Gunakan shadow hanya jika menyampaikan hierarchy; utamakan border dan whitespace.
- Tidak menggunakan bento, gradient, glassmorphism, atau animasi perpetual karena tidak sesuai kebutuhan operasional.
- Gunakan motion ringan hanya untuk page transition, dialog, feedback aksi, dan perubahan status.
- Pertahankan `lucide-react` karena sudah menjadi icon family proyek.

## 4. Rencana Implementasi

### Fase UI-1 — Foundation dan aksesibilitas

**Status: selesai** — token visual, primitive UI, focus state, ukuran kontrol, dan fondasi layout sudah dinormalisasi.

- Tetapkan satu container standar untuk seluruh halaman authenticated.
- Normalisasi radius, border, shadow, status badge, input, select, dan button.
- Naikkan minimum teks informasi penting menjadi 12–13px.
- Audit kontras `text-ink-muted`, `text-ink-light`, placeholder, badge, dan focus state agar memenuhi WCAG AA.
- Standarkan label form, helper text, error text, loading, disabled, dan active state.

### Fase UI-2 — Workflow petugas

**Status: selesai** — quick actions, sticky progress, status sinkronisasi, retry inline, dan feedback aksi sudah tersedia.

- Jadikan status shift sebagai fokus utama pada daftar shift.
- Berikan shortcut yang jelas untuk `Lanjutkan shift`, `Buka shift`, `Handover`, dan `Laporkan incident`.
- Buat ringkasan progress checklist lebih persistent saat pengguna scroll.
- Tambahkan status sinkronisasi: tersimpan, menyimpan, gagal tersimpan, dan retry.
- Pertahankan skeleton tetapi samakan dimensi skeleton dengan konten final.
- Pastikan aksi utama memiliki feedback inline selain toast.

### Fase UI-3 — Workflow admin

**Status: selesai** — dashboard monitoring/configuration, deep-link metric, filter apply, filter mobile, dan arsip preview sudah tersedia.

- Tambahkan quick actions dan deep-link dari metric dashboard.
- Pisahkan monitoring operasional dari konfigurasi agar dashboard tidak terlalu penuh.
- Pastikan branch picker terlihat jelas pada konteks admin yang membutuhkan cabang kerja.
- Ubah filter incident/laporan menjadi filter bar yang dapat diringkas di mobile.
- Gunakan tombol `Terapkan filter` untuk filter kompleks dan debounce untuk pencarian teks.
- Tampilkan status arsip tahunan dan hasil pratinjau pada area administrasi.

### Fase UI-4 — Navigasi dan responsive QA

**Status: selesai** — navigasi mobile dibatasi lima tombol, drawer menu dan branch picker konsisten, safe-area diperkuat, serta tabel admin memiliki representasi card mobile.

- Pertahankan maksimal lima tombol pada bottom navigation mobile.
- Evaluasi posisi Dashboard admin sebagai item inti atau menu admin.
- Tambahkan pola judul halaman dan breadcrumb/sub-navigation yang konsisten.
- Pastikan sidebar, header, bottom bar, keyboard mobile, dan safe-area tidak menutupi konten.
- Pastikan tabel memiliki representasi card mobile yang setara, bukan hanya overflow horizontal.

### Fase UI-5 — Konsistensi akhir

**Status: selesai** — login diselaraskan dengan design system authenticated, variasi visual utama dipersempit, dan reduced-motion diterapkan pada motion wrapper reusable.

- Samakan bahasa visual login dengan brand aplikasi tanpa mengurangi kontras.
- Hapus variasi komponen yang tidak diperlukan.
- Audit semua halaman untuk empty, loading, error, disabled, focus, hover, active, dan reduced-motion state.

## 5. Kriteria Sukses

- Petugas dapat menyelesaikan alur utama tanpa membuka menu sekunder.
- Pada viewport mobile, aksi utama tetap terlihat dan tidak tertutup bottom bar.
- Seluruh halaman authenticated memakai container, spacing, radius, dan typography yang konsisten.
- Seluruh form memiliki label, focus, error, loading, dan disabled state yang seragam.
- Status checklist dan sinkronisasi dapat dipahami tanpa mengandalkan toast.
- Filter admin tidak mengirim request pada setiap karakter tanpa debounce atau apply action.
- Kontras teks dan kontrol memenuhi WCAG AA.
- Tidak ada perubahan API atau model data kecuali benar-benar diperlukan untuk status sinkronisasi UI.

## 6. Validasi

- Jalankan `npm run typecheck`.
- Jalankan `npm run lint`.
- Jalankan `npm run test`.
- Jalankan `npm run build`.
- Uji manual pada viewport 360px, 390px, 768px, 1280px, dan zoom 200%.
- Uji role `petugas` dan `admin` pada alur shift, checklist, handover, incident, laporan, dan pengaturan.
- Uji loading lambat, error API, empty state, retry, keyboard mobile, focus keyboard, dan reduced motion.
- Uji checklist saat koneksi terputus lalu tersambung kembali.
- Uji filter incident/laporan dengan data besar dan perubahan filter cepat.

## 7. Batasan dan Asumsi

- Refaktor mengikuti pendekatan preserve + polish, bukan rewrite visual total.
- Petugas operasional mobile menjadi prioritas utama; admin menjadi prioritas kedua.
- Tidak menambah library UI baru; gunakan primitive yang sudah tersedia.
- Backend, Google Sheets, API, dan struktur data tetap dipertahankan.
- Implementasi dilakukan berurutan: foundation → petugas → admin → responsive/accessibility QA.
