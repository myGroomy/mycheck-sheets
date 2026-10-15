# App Flow MyCheck

Dokumen ini menggambarkan route dan alur yang terhubung pada source aktif per
14 Oktober 2026. Ini bukan jaminan semua behavior telah diuji runtime. PRD
menjelaskan target produk; bila target belum ada di sini atau di source, lihat
status di `IMPLEMENTATION_PLAN.md`.

## 1. Route halaman yang tersedia

```text
/                                  landing untuk tamu; redirect admin/petugas
/login
/ganti-pin
/daftar-shift                      daftar cabang dan shift petugas
/shift/[id]                        checklist/progress satu instance shift
/incident
/incident/baru
/incident/[id]
/report
/report/[id]
/admin
/admin/cabang
/admin/akun
/admin/shift
/admin/checklist-builder
/admin/handover
/admin/handover/builder
/admin/kategori-incident
/admin/operasi-shift
/admin/incident
/admin/laporan
/admin/pengaturan
/admin/audit-log
/docs/[[...slug]]
/r/[token]                         laporan publik read-only
```

Route admin dijaga oleh `app/admin/layout.tsx`; daftar yang tepat selalu dapat
diperiksa dari folder `app/`. Route `/home`, `/checklist`, `/akun`,
`/notifikasi`, `/report/[shiftId]`, dan route terpisah untuk tutup/handover
**tidak** ditemukan sebagai halaman saat audit ini.

## 2. Shell dan navigasi aktual

- Root layout memuat auth/cabang provider, `AuthGuard`, `PwaStatus`, serta
  `NavbarClient`.
- Tamu dapat membuka `/`, `/login`, `/docs/**`, dan `/r/**`.
- Admin di luar area `/admin` mendapat menu menuju Dashboard/Operasi/Incident/
  Laporan dan menu lainnya. Di area `/admin`, desktop menggunakan header dan
  sidebar; layar kecil memakai bottom navigation Dashboard, Operasi, Incident,
  Laporan, serta drawer Lainnya.
- Petugas memakai halaman `/daftar-shift` sebagai tujuan kerja utama. Navigasi
  bawah menyediakan Checklist, Incident, Laporan dan Lainnya; desktop memakai
  menu header.
- `/` bukan dashboard petugas aktif: halaman ini menampilkan landing page untuk
  tamu, mengarahkan admin ke `/admin`, dan petugas ke `/daftar-shift`.
- Service worker hanya cache manifest dan ikon/aset statis terpilih. Tidak ada
  cache checklist/report atau antrean penulisan offline.

## 3. Alur petugas yang berjalan

```text
Login -> /daftar-shift -> pilih cabang/definisi shift
  -> Buka Shift (menjadi PJ) atau Gabung/Check-in
  -> /shift/[id] -> checklist bersama, progress, peserta
  -> PJ: dialog Tutup Shift (3 langkah: validasi, handover, PIN)
  -> shift ditutup + report dibuat -> /report untuk meninjau
```

- Shift aktif dibuka melalui `/api/shifts/open`; peserta lain dapat bergabung
  melalui `/api/shifts/[id]/join`.
- Shift memakai snapshot template saat dibuka. Item checklist ditulis melalui
  route entries dan progress direfresh/polling oleh UI.
- Konflik checklist mendapat respons konflik; UI mempertahankan sinkronisasi
  melalui refresh/reconciliation.
- Dialog penutupan mewajibkan item wajib selesai/skip beralasan, field handover
  wajib, dan PIN PJ. Handover disimpan dan report dibuat sebelum shift ditutup
  lewat beberapa operasi Sheets; operasi ini bukan satu transaksi.
- Form incident tersedia di `/incident/baru`; detail dan catatan berada di
  `/incident/[id]`.
- Laporan petugas tersedia di `/report` dan `/report/[id]`; link publik
  `/r/[token]` membaca laporan tanpa login selama token valid.

## 4. Alur admin yang berjalan

Navigasi aktual didefinisikan di `components/NavbarClient.tsx`.

| Halaman | Fungsi yang terlihat dari source |
|---|---|
| `/admin` | Dashboard/indikator lintas cabang. |
| `/admin/operasi-shift` | Daftar dan tindakan operasional shift. |
| `/admin/incident`, `/admin/kategori-incident` | Daftar incident dan halaman kategori; navigasi mengelompokkannya dalam area Incident. |
| `/admin/laporan` | Daftar laporan, tautan publik, ekspor yang tersedia. |
| `/admin/cabang`, `/admin/akun` | Pengelolaan Registry. |
| `/admin/shift`, `/admin/checklist-builder` | Konfigurasi shift dan template. |
| `/admin/handover`, `/admin/handover/builder` | Satu halaman dua tab: riwayat handover, dan template bidang serah terima. Route lama `/admin/handover-builder` dialihkan ke tab builder. |
| `/admin/pengaturan` | Pengaturan yang terdaftar di catalog kode. |
| `/admin/audit-log` | Baca/filter audit log. |

API admin menyediakan operasi tutup paksa, ganti PJ, void, buka shift atas
nama, addendum, berbagi/cabut token, reset PIN, buka kunci akun, dan operasi
konfigurasi tertentu. Syarat alasan/PIN berlaku sesuai handler individual;
jangan menyimpulkan semua aksi admin memakai dialog atau kontrol keamanan yang
sama.

Tidak ditemukan halaman/tab Statistik admin tersendiri. Endpoint `/api/admin/stats`
dan ringkasan Dashboard ada, tetapi cakupan metrik harus diperiksa di
`lib/admin/stats-service.ts`. Endpoint export laporan yang diperiksa
menghasilkan CSV; PDF export tidak ditemukan.

## 5. Batasan alur yang perlu diketahui

- `/ganti-pin` dan endpoint perubahan PIN tersedia, tetapi `AuthGuard` tidak
  memaksa redirect berdasarkan flag `Must_Change_Pin`. Jangan dokumentasikan
  forced-change sebagai perilaku terjamin.
- Login memakai PIN plaintext dan sesi HMAC stateless 7 hari. `logout-all`
  saat ini menghapus cookie browser pemanggil saja.
- Service worker hanya cache aset shell. Saat offline, jangan mengandalkan
  data atau mutasi yang tersimpan lokal.
- API route melakukan pemeriksaan auth/role/branch sesuai handler. Verifikasi
  route satu per satu; kehadiran item navigasi bukan kontrol akses.
- Sheet dan operasi lintas sheet tidak atomik. Uji kegagalan parsial dan
  konkurensi sebelum menganggap alur aman terhadap semua race.

## 6. Area yang belum menjadi alur aktif

Dokumen produk juga menyebut notifikasi push, preferensi notifikasi per jenis,
offline read cache/write queue, PDF, arsip foto otomatis, statistik lengkap,
dan verifikasi hash-chain terjadwal. Fitur-fitur tersebut tidak boleh
dipresentasikan sebagai alur aktif hanya karena disebut dalam PRD atau schema;
periksa implementasinya sebelum memperbarui status.
