# MyCheck

MyCheck adalah aplikasi PWA untuk mengelola operasional shift cabang F&B:
checklist SOP, handover, incident, draft pemulihan, laporan, dan audit trail.

## Mengapa MyCheck

Pekerjaan shift perlu tetap dapat dilanjutkan ketika halaman direfresh atau
perangkat berpindah jaringan. MyCheck memakai satu alur per shift, akses
berbasis role dan cabang, penyimpanan draft lokal plus buffer Redis, lalu
menulis data final ke Google Sheets sebagai database operasional.

## Arsitektur singkat

- **Frontend/API:** Next.js App Router, TypeScript, Tailwind CSS, dan route handler.
- **Identitas:** session cookie, role `admin` atau `petugas`, dan akses cabang.
- **Database:** Google Sheets dengan schema terpusat di `lib/schema/`; mode `flat`
  adalah default, sedangkan `monthly` dan `yearly` tetap untuk kompatibilitas.
- **Draft:** localStorage untuk pemulihan perangkat, Upstash Redis untuk buffer
  server, lalu sinkronisasi batch saat checkpoint atau penutupan shift.
- **File:** Google Drive untuk foto bukti, dengan folder ID tetap disimpan di
  registry sesuai schema.

## Prasyarat

- Node.js sesuai versi pada `package.json` dan npm.
- Google Cloud project dengan Google Sheets API, Google Drive API, dan service
  account yang dapat membaca spreadsheet registry serta spreadsheet cabang.
- Upstash Redis REST URL dan token untuk buffer draft server.
- File environment lokal yang diisi dari pemilik deployment. Jangan commit
  secret, PIN, spreadsheet ID produksi, atau token.

## Instalasi lokal

```bash
npm install
cp .env.example .env.local
```

Isi minimal environment sesuai deployment:

```dotenv
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="..."
REGISTRY_SPREADSHEET_ID=...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Schema dan header spreadsheet harus mengikuti `PLAN/DATABASE_SCHEMA.md` dan
file di `lib/schema/`. Untuk perubahan registry, gunakan alur aplikasi/GAS dan
lakukan backup atau dry-run terlebih dahulu.

## Development dan validasi

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

Buka `http://localhost:3000`. Login memakai akun yang disiapkan admin di
registry. Pengguna multi-cabang memilih cabang kerja dari header sebelum membuka
shift atau membuat data baru.

## Alur pengguna

1. Login dan pilih cabang kerja bila memiliki lebih dari satu cabang.
2. Buka atau gabung ke shift.
3. Kerjakan checklist; progress tersimpan sebagai draft dan dapat dipulihkan.
4. Catat handover atau incident bila diperlukan.
5. PJ menyelesaikan validasi dan menutup shift.
6. Tinjau laporan; koreksi pasca-penutupan dilakukan melalui alur addendum/audit.

## Struktur repository

- `app/`: halaman dan API route Next.js.
- `components/`: UI, form, loader, dan alur shift.
- `lib/schema/`: nama sheet, header, normalisasi, dan periode.
- `lib/store.ts`: akses data Google Sheets.
- `lib/google/`: integrasi registry dan Drive.
- `content/docs/`: dokumentasi pengguna dan developer.
- `PLAN/`: schema, ERD, keputusan arsitektur, dan rencana implementasi.

## Deployment dan operasi aman

Build production dengan `npm run build`, lalu jalankan sesuai platform
deployment. Pastikan environment production memakai secret manager dan service
account dengan akses minimum. Migrasi, arsip, cleanup, dan copy konfigurasi
harus melalui preview/dry-run, backup, audit log, dan rollback; histori shift
tidak boleh di-hard-delete.

Jika sinkronisasi draft gagal, jangan menghapus localStorage. Periksa status
Redis, log route sync, koneksi Sheets, dan gunakan recovery yang tersedia di
halaman shift. Panduan rinci tersedia di `/docs`.
