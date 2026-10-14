# Petunjuk Developer MyCheck

Dokumen ini berisi batas produk dan cara kerja. Untuk mengetahui apa yang
benar-benar berjalan, periksa source code dan bagian **status implementasi**
di `PRD.md`; dokumen spesifikasi lain dapat memuat target yang belum
diimplementasikan.

## 1. Sumber Kebenaran

Untuk **perilaku yang berjalan**, urutannya:

1. Route handler, komponen, helper, konfigurasi, dan skema aktual di repository.
2. Catatan status implementasi di `PRD.md` dan `IMPLEMENTATION_PLAN.md`.
3. Dokumen teknis `TRD.md`, `DATABASE_SCHEMA.md`, dan `ERD.md`.
4. Dokumen produk/desain `APP_FLOW.md`, `UI-UX.md`, dan `PRD.md`.
5. Rencana atau laporan historis: `REFACTOR.md`, `plan-performance.md`, dan
   `.PLAN/performa-mycheck.md`.

Jika kebutuhan baru bertentangan dengan source atau aturan produk, jelaskan
kontradiksinya. Jangan menganggap requirement sebagai bukti fitur sudah ada.

## 2. Lingkup Produk

- Dua peran akun: Petugas dan Admin. PJ adalah status shift, bukan peran akun.
- MyCheck membantu mencatat checklist SOP, incident, handover, dan laporan
  shift. MyCheck bukan penjadwalan/absensi, aplikasi stok, POS, aplikasi
  native, atau sistem payroll.
- Antarmuka utama berbahasa Indonesia dan mobile-first.

## 3. Arsitektur yang Berjalan

- Satu project Next.js App Router di root repository (`app/`, `components/`,
  `lib/`, `public/`); bukan monorepo.
- Stack manifest saat ini: Next.js 16, React 19, TypeScript, Tailwind CSS 4,
  Radix/shadcn-style components, dan Oxlint. Periksa `package.json` untuk
  versi tepat.
- API berada di `app/api/**/route.ts`. Data browser tidak mengakses Google
  Sheets secara langsung.
- Registry Google Sheets menyimpan cabang, akun, konfigurasi global, dan
  token berbagi. Satu spreadsheet Google Sheets digunakan per cabang.
- Daftar nama/kolom yang dipakai kode cabang berada di
  `lib/google/branch-schema.ts`; helper akses data ada di `lib/store.ts` dan
  `lib/google/sheets.ts`. Baca memakai cache singkat dan batch read jika sesuai.
- Foto disimpan di Google Drive. Metadata foto berada di tab bulanan `Photos`.
- `lib/db/` berisi helper aplikasi seperti waktu server, snapshot, dan audit;
  **bukan** koneksi PostgreSQL, ORM, atau database SQL.
- `public/manifest.json` mendeklarasikan PWA. `public/sw.js` hanya cache aset
  shell yang dipilih; data checklist/laporan tidak dijanjikan tersedia offline.

## 4. Auth dan Keamanan: Fakta Implementasi

Bagian ini mendokumentasikan keadaan kode, bukan standar keamanan yang
diinginkan:

- Login memakai `Username` dan `PIN` dari Registry. Kode saat ini menyimpan
  dan membandingkan PIN sebagai teks biasa. Ini risiko keamanan yang belum
  diselesaikan; jangan menyalin PIN ke contoh, log, issue, atau dokumentasi.
- `mycheck_session` adalah token HMAC-SHA256 stateless, masa berlaku 7 hari.
  Signing key dibaca dari `STOKIS_API_KEY`; hanya nama variabel yang boleh
  dicantumkan dalam dokumentasi.
- Cookie menggunakan `HttpOnly` dan `SameSite=Strict`; flag `Secure` dipasang
  pada production. Logout menghapus cookie browser. Endpoint `logout-all`
  yang ada juga hanya menghapus cookie di pemanggilnya—tidak mencabut token
  stateless lain.
- Tidak ditemukan mekanisme lockout PIN atau rate limiting login.
- `proxy.ts` memeriksa keberadaan cookie; verifikasi token dilakukan oleh
  server/API helpers. Proteksi role/cabang diterapkan oleh handler yang
  memanggil helper terkait; jangan menyatakan bahwa setiap route telah
  diverifikasi menyeluruh tanpa menguji route tersebut.
- Klien mengirim `X-Requested-With` pada sebagian aksi, tetapi tidak ada
  pemeriksaan CSRF terpusat yang dapat diasumsikan aktif.
- Zod dipakai di sebagian route; validasi lain dilakukan manual. Jangan
  menyatakan semua input API memakai Zod.
- Jangan menaruh service-account key atau secret di klien, log, respons, atau
  repository. Batasi akses Registry dan spreadsheet cabang.

## 5. Batasan Data dan Konsistensi

- Google Sheets tidak memiliki transaksi, foreign key, unique index, atau row
  lock. Operasi beberapa sheet dapat gagal sebagian.
- `POST /api/shifts/open` memakai ID deterministik dan rekonsiliasi duplikat
  BR-01, tetapi bukan constraint atomik database.
- Aksi checklist memakai `client_action_id` dan rekonsiliasi BR-12 di kode;
  jangan menjanjikan transaksi/lock yang tidak tersedia.
- Snapshot template disimpan pada instance shift, sehingga perubahan template
  tidak mengubah snapshot shift yang sudah berjalan.
- Pembacaan spreadsheet dapat di-cache; verifikasi PIN admin menggunakan
  pembacaan segar. Penulisan helper Sheets memakai `RAW`.
- Hindari perubahan langsung pada spreadsheet operasional. Bila perbaikan data
  memang diperlukan, jelaskan dampak, cadangkan data, dan catat tindakan.

## 6. Alur dan Route Aktual

- `/` menampilkan landing page untuk tamu, mengarahkan admin ke `/admin`, dan
  petugas ke `/daftar-shift`.
- Alur kerja petugas menggunakan `/daftar-shift`, `/shift/[id]`, `/incident`,
  `/incident/baru`, `/incident/[id]`, `/report`, dan `/report/[id]`.
- Area admin memakai `/admin` beserta halaman di bawah `/admin/*`. Daftar
  route lengkap ada di `APP_FLOW.md`; route handler API aktual ada di `app/api`.
- Laporan publik dan foto yang terkait token menggunakan `/r/[token]` serta
  `/api/public/report/[token]/**`.
- Service worker tidak membuat offline write queue. Koneksi putus dapat
  menggagalkan mutasi; pengguna harus memeriksa status lalu mencoba kembali.

## 7. Dokumentasi dan Validasi

- Perbarui dokumen yang diminta setelah membandingkan klaimnya dengan source.
  Tandai dengan jelas mana requirement, implementasi, rencana, dan hasil yang
  benar-benar diuji.
- Tidak ada script `test` maupun berkas test/spec aplikasi yang ditemukan
  dalam audit 14 Oktober 2026. Jangan menandai skenario otomatis lulus tanpa
  menambahkan/menjalankan test yang nyata.
- Script repository: `npm run lint`, `npm run typecheck`, `npm run build`.
  Jalankan pemeriksaan paling relevan dan catat skenario runtime yang belum
  dilakukan.
- Jangan commit atau push kecuali diminta pengguna.

## 8. Perintah

Jalankan dari root `mycheck/`:

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run setup:registry
npm run setup:branch -- <Cabang_ID> <Nama> <Spreadsheet_ID> [Timezone] [Kode]
npm run seed:admin
```

Periksa `package.json`, `.env.example`, dan pemakaian environment aktual
sebelum mengubah konfigurasi. Jangan pernah mencetak isi file environment.
