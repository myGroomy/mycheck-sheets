# UI/UX MyCheck — Panduan yang Mengikuti Implementasi

Dokumen ini dirapikan berdasarkan komponen dan route yang ada pada 14 Oktober
2026. Ini bukan spesifikasi desain yang seluruhnya telah diuji aksesibilitasnya.
Token aktif ada di `app/globals.css`, font di `app/layout.tsx`, dan pola
komponen di `components/ui/`.

`elevenlabs-DESIGN.md` adalah referensi desain terpisah, bukan design system
MyCheck. Jangan menganggap font Waldenburg/Inter, gradient orb, pill CTA, atau
layout ElevenLabs sebagai komponen/aturan visual MyCheck.

## 1. Arah visual dan komponen

- Antarmuka memakai token warna dan radius dari `app/globals.css`, dengan
  Plus Jakarta Sans didaftarkan dari `app/layout.tsx`.
- UI memakai Tailwind CSS dan komponen lokal bergaya shadcn/Radix di
  `components/ui/`. Gunakan button, card, dialog, table, input, skeleton,
  sonner, dan primitive yang sudah ada bila sesuai.
- Ikon yang digunakan berasal dari Lucide. Status penting harus memiliki teks,
  tidak hanya mengandalkan warna.
- Jangan menyalin design token dari referensi ElevenLabs ke aplikasi tanpa
  perubahan kode/desain yang disetujui.

## 2. Navigasi dan layout yang tersedia

- Root layout: header navigasi, provider auth/cabang, guard sisi klien,
  banner koneksi/install PWA, dan toaster.
- Petugas: `/daftar-shift` adalah tujuan checklist utama; route kerja shift
  adalah `/shift/[id]`. Navigasi bawah menyediakan Checklist, Incident,
  Laporan, dan Lainnya. Pada desktop tujuan utama ada di menu header.
- Admin: di area `/admin`, desktop memiliki sidebar di bawah header; pada layar
  kecil ada bottom navigation Dashboard/Operasi/Incident/Laporan dan drawer
  Lainnya. Layout halaman admin menambah ruang kiri untuk sidebar.
- `/` mengarahkan petugas ke `/daftar-shift` dan admin ke `/admin`; tidak ada
  halaman Home petugas yang aktif dari route ini.

## 3. Halaman dan interaksi aktual

| Area | Route | Interaksi yang tersedia di source |
|---|---|---|
| Login / PIN | `/login`, `/ganti-pin` | Username + PIN, form ganti PIN. Kode saat ini menyimpan PIN sebagai plaintext; perubahan PIN tidak mengubah mekanisme sesi stateless yang sudah diterbitkan. |
| Daftar shift | `/daftar-shift` | Data cabang/shift dari provider, buka, gabung/check-in, lanjutkan, atau lihat status. |
| Checklist | `/shift/[id]` | Kategori dan item snapshot, input beberapa tipe, skip beralasan, progress/peserta, refresh kolaboratif. |
| Tutup shift | Dialog pada halaman shift | Tiga langkah: validasi checklist, handover, konfirmasi PIN PJ. |
| Incident | `/incident`, `/incident/baru`, `/incident/[id]` | Daftar, form baru dengan foto, detail dan catatan. |
| Laporan | `/report`, `/report/[id]` | Daftar dan detail laporan; tindakan berbagi sesuai halaman/role. |
| Admin | `/admin/**` | Dashboard, operasi, incident/kategori, laporan, konfigurasi, pengaturan, audit log. |
| Publik | `/r/[token]` | Laporan read-only berdasarkan token; route foto publik khusus laporan tersedia. |

Tidak ada halaman aktif dengan route `/home`, `/checklist`, `/shifts/[id]`,
`/incidents`, `/reports/[id]`, `/akun`, atau `/notifikasi`. Periksa direktori
`app/` sebelum menambah instruksi route.

## 4. State dan batas perilaku

- Skeleton/loading tersedia di root, daftar shift, incident, report, dan detail
  shift. Detail implementasi berada pada `app/**/loading.tsx` dan
  `components/ui/skeletons.tsx`.
- Form menampilkan validasi/error di beberapa alur; bentuk pesan dan
  penanganan error belum seragam di seluruh API/UI.
- Checklist memperbarui hasil lokal setelah respons accepted serta merefresh
  pada konflik/rekonsiliasi; polling berjalan saat halaman terlihat.
- `PwaStatus` menampilkan status offline dan install prompt pada browser yang
  mendukung. Service worker meng-cache manifest, ikon, dan aset build tertentu,
  bukan data shift/report; tidak ada antrean offline.
- Penutupan memakai `Dialog`, bukan route wizard terpisah. Foto diterima
  sebagai WebP/PNG/JPEG, dibatasi 5 MB per file dan hingga lima foto per owner
  di route upload. Kompresi WebP wajib di sisi klien tidak dapat diasumsikan.
- Navigation breakpoint dan target interaksi harus diverifikasi di browser;
  dokumen ini tidak mengklaim uji manual 320px, safe-area, keyboard, kontras,
  atau screen reader telah dijalankan.

## 5. Admin dan hal yang belum ada

- Daftar menu aktual ada di `components/NavbarClient.tsx`; halaman admin ada
  di `app/admin/`.
- Incident dan kategori incident memiliki route masing-masing dan tab
  navigasi internal. Kategori juga tetap dapat dibuka langsung.
- Daftar laporan admin tersedia; tab Statistik tersendiri tidak ditemukan.
  Endpoint stats tidak berarti semua statistik PRD tersedia.
- Tidak ditemukan fitur PDF export, preferensi notifikasi per jenis, web push,
  offline data cache, atau arsip foto otomatis. Jangan memasukkannya sebagai
  desain terimplementasi tanpa verifikasi source baru.

## 6. Pemeriksaan sebelum memperbarui panduan

1. Konfirmasi halaman di `app/` dan tautan navigasi di `NavbarClient.tsx`.
2. Periksa komponen serta API route untuk interaksi, validasi, dan batas ukuran.
3. Pisahkan state produk yang direncanakan dari behavior yang ada.
4. Tandai setiap pengujian manual sebagai belum dilakukan sampai benar-benar
   diperiksa pada browser/perangkat sasaran.
