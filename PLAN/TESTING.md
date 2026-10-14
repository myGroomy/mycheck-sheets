# Panduan Verifikasi MyCheck

**Status audit 14 Oktober 2026:** repository memiliki lint, typecheck, dan
build; tidak ditemukan script test otomatis atau file `*.test.*` /
`*.spec.*`. Skenario di bawah adalah checklist usulan/manual dan **belum
dianggap lulus** sampai ada hasil eksekusi yang dicatat.

## 1. Pemeriksaan otomatis yang tersedia

Jalankan dari root project:

```bash
npm run lint
npm run typecheck
npm run build
git diff --check
```

Perintah tersebut tidak menguji service account, spreadsheet, Google Drive,
akses role/cabang, konkurensi request, browser, atau deployment.

## 2. Persiapan uji manual/integrasi

- Gunakan Registry dan spreadsheet cabang uji yang terpisah dari data aktif.
- Siapkan akun petugas untuk satu cabang, petugas untuk dua cabang, dan admin.
- Pastikan foto uji tidak mengandung data pribadi; sediakan folder Drive uji.
- Catat versi/browser, tanggal, route, input, hasil yang diharapkan, hasil
  aktual, dan log yang sudah disensor.
- Jalankan uji konkurensi dari dua akun/perangkat atau dua request paralel,
  bukan hanya dua tab dengan sesi yang sama.

## 3. Auth, sesi, dan akses

- [ ] Uji login benar/salah dan akun nonaktif; verifikasi error tanpa
  membocorkan secret atau nilai PIN.
- [ ] Uji perubahan PIN lama/baru, nilai format salah, dan login setelah PIN
  diubah.
- [ ] Uji masa berlaku token dan perilaku logout.
- [ ] Dokumentasikan bahwa logout-all pada source saat ini hanya membersihkan
  cookie pemanggil; jangan menganggap sesi perangkat lain tercabut.
- [ ] Uji petugas mengakses endpoint admin dan cabang di luar akses melalui
  request langsung.
- [ ] Uji halaman `/ganti-pin`; pastikan jangan menganggap forced redirect
  berjalan, karena guard saat ini tidak memaksa redirect berdasar
  `Must_Change_Pin`.

**Catatan risiko source:** login membandingkan PIN plaintext; tidak ditemukan
rate limiting atau lockout login. Jangan melakukan brute-force test terhadap
akun/data production.

## 4. Siklus shift dan checklist

- [ ] Buka shift baru pada cabang/tanggal uji; periksa zona waktu, status,
  PJ, peserta, dan snapshot yang tersimpan.
- [ ] Kirim dua request buka untuk definisi/tanggal/tipe test yang sama;
  periksa instance kanonik, hasil respons, dan baris hasil rekonsiliasi.
- [ ] Bergabung dari akun kedua; pastikan progress dan pelaku tercatat.
- [ ] Uji semua tipe input yang dikonfigurasi, rentang angka, opsi pilihan,
  skip beralasan, pembatalan, dan idempotensi `client_action_id`.
- [ ] Kirim dua aksi checklist pada item yang sama secara paralel; periksa
  hasil accepted/conflict, entry kanonik, log, dan tampilan klien setelah
  refresh.
- [ ] Uji polling/refresh ketika tab terlihat, tersembunyi, kembali fokus,
  serta setelah aksi berhasil/gagal.
- [ ] Uji item wajib yang belum lengkap menahan penutupan; field handover
  wajib dan PIN PJ divalidasi; report/status terbentuk setelah sukses.
- [ ] Uji data dan respons ketika operasi Sheets parsial gagal. Beberapa write
  bukan satu transaksi sehingga kondisi parsial perlu diperiksa eksplisit.

## 5. Incident, foto, handover, dan laporan

- [ ] Buat incident dengan dan tanpa shift; uji status, catatan, dan batas foto.
- [ ] Uji file WebP/PNG/JPEG, ukuran maksimum 5 MB per foto, format ditolak,
  owner yang tidak sah, dan akses foto dengan user yang tidak berwenang.
- [ ] Uji handover dan ack baca untuk shift berikutnya; uji field kombinasi
  dan foto handover.
- [ ] Periksa laporan terkunci, isi checklist/skip/incident/handover/peserta,
  addendum, token valid/kedaluwarsa/dicabut, dan foto publik token.
- [ ] Uji CSV export termasuk nilai yang diawali karakter formula; PDF export
  tidak ditemukan pada source saat audit.

## 6. Admin, audit, statistik, notifikasi

- [ ] Uji CRUD cabang/user/template dan perubahan yang berlaku hanya untuk
  shift baru.
- [ ] Uji force-close, change-PJ, void, open-on-behalf, addendum, reset PIN,
  unlock akun, dan operasi sensitif yang sesuai; pastikan alasan/PIN/audit
  mengikuti kontrak handler masing-masing.
- [ ] Periksa Dashboard dan `/api/admin/stats` terhadap data fixture yang
  diketahui; jangan menyamakan endpoint stats dengan seluruh metrik PRD.
- [ ] Uji daftar dan mark-as-read notifikasi. Jangan menganggap web push atau
  semua event notification tersedia.
- [ ] Periksa append audit log, urutan/hash per tab bulanan. Endpoint
  `/api/cron/verify` saat ini hanya memvalidasi secret; jangan menandai
  verifikasi hash-chain terjadwal lulus.

## 7. PWA, jaringan, dan tampilan

- [ ] Uji manifest, install prompt pada browser yang mendukung, dan
  pendaftaran service worker production.
- [ ] Uji cache hanya untuk aset shell; data checklist/report tidak dijamin
  dapat dibuka offline dan mutasi tidak memiliki offline queue.
- [ ] Uji banner status koneksi dan aksi gagal saat offline; muat ulang status
  sebelum mengulangi write.
- [ ] Uji viewport 320px, ponsel, tablet, desktop, safe-area, overflow,
  keyboard/focus, kontras, dan label form.
- [ ] Verifikasi menu role, active state, drawer, sidebar, dan ruang bawah
  navigasi agar aksi tidak tertutup.

## 8. Cara mencatat hasil

Jangan centang item saat baru direncanakan. Simpan hasil eksekusi dalam
laporan perubahan/release:

```text
Skenario:
Lingkungan (versi/browser/akun uji):
Langkah:
Diharapkan:
Aktual:
Status (lulus/gagal/tidak dijalankan):
Bukti/log tersensor:
```

Sebelum rilis, prioritaskan akses cabang, operasi sensitif, shift/checklist,
penutupan, integritas laporan, dan perlindungan secret. Lulus lint/build tidak
menggantikan uji manual atau uji integrasi tersebut.
