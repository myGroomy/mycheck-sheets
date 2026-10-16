# Technical Reference MyCheck

**Status:** Gambaran teknis implementasi yang ditemukan pada 14 Oktober 2026.
Ini bukan bukti semua behavior telah diuji dan bukan spesifikasi target masa
depan. Kolom spreadsheet yang dipakai kode dirinci di `DATABASE_SCHEMA.md` dan
`lib/google/branch-schema.ts`.

## 1. Stack dan struktur

- Satu Next.js App Router project pada root repository (`app/`,
  `components/`, `lib/`, `public/`); tidak ada workspace `apps/web` atau
  `packages/shared`.
- Manifest package saat audit: Next.js 16, React 19, TypeScript, Tailwind CSS
  4, Zod, Google APIs, Oxlint. Gunakan `package.json` sebagai versi aktual.
- UI, API routes, auth helpers, Google Sheets/Drive clients berada pada satu
  deployment unit.
- `lib/db/` berisi helper aplikasi (`audit`, `snapshot`, `server-time`) dan
  bukan adapter PostgreSQL.

## 2. Data dan storage

```text
Browser -> Next.js page/API -> Google Sheets API
                           -> Google Drive (foto)
```

- Registry spreadsheet menyimpan cabang, users, global settings, template
  reference, dan share tokens. Setiap cabang menunjuk spreadsheet tersendiri.
- Sheet statis berisi konfigurasi dan state shift; entries, logs, handovers,
  incidents, photos, serta audit disusun dalam tab bulanan bila didefinisikan
  sebagai sheet bulanan. Skema kode adalah `lib/google/branch-schema.ts`.
- Akses data lewat `lib/store.ts`, helper API di `lib/google/sheets.ts`.
  Pembacaan memakai TTL/single-flight; `readSheetsBatch` menggabungkan beberapa
  sheet dari spreadsheet sama. Penulisan helper memakai `RAW`.
- Metadata foto berada di sheet; bytes foto disimpan di Google Drive dan
  diambil melalui route aplikasi (route foto publik terpisah untuk laporan
  berbagi).
- Tidak ada SQL database, ORM, migration tool, transaction, row lock, foreign
  key, atau unique index pada Google Sheets.

## 3. Auth dan akses: keadaan aktual

- `POST /api/auth/login` membaca `Users` dan membandingkan PIN teks biasa.
  PIN disimpan plaintext di Registry; tidak ada hashing.
- `lib/session.ts` membuat token HMAC-SHA256 stateless di cookie
  `mycheck_session`, expiry 7 hari. Secret signing memakai
  `SESSION_SECRET` (minimal 32 karakter sesuai `lib/env.ts`).
- Cookie memiliki `HttpOnly`, `SameSite=Strict`, dan `Secure` pada production.
- `proxy.ts` memeriksa keberadaan cookie; helper page/API memvalidasi signature
  dan expiry. Handler menerapkan role/cabang sesuai pemakaiannya.
- `POST /api/auth/logout` dan `logout-all` menghapus cookie pemanggil. Karena
  tidak ada registry sesi/revocation di server, token pada browser lain tidak
  dicabut oleh `logout-all`.
- Tidak ditemukan counter lockout/rate limit login. Tidak ada enforcement
  CSRF terpusat yang dapat dipastikan dari helper saat audit ini.
- Zod dipakai pada beberapa handler, namun route lain menggunakan validasi
  manual. Validasi menyeluruh perlu dinilai per endpoint.

> **Risiko keamanan yang diketahui:** PIN plaintext, tiadanya throttling/login
> lockout, dan sesi stateless yang tidak bisa dicabut lintas perangkat. Ini
> catatan faktual, bukan rekomendasi untuk mempertahankan desain tersebut.

## 4. Alur data bisnis yang penting

- Pembukaan shift menyusun snapshot template dan menyimpan instance di sheet.
  ID deterministik, pengecekan awal, dan rekonsiliasi duplikat digunakan untuk
  BR-01; tidak ada jaminan atomicity dari database.
- Aksi checklist menggunakan `client_action_id`, memeriksa state entry, dan
  melakukan rekonsiliasi entry deterministik untuk BR-12. Request paralel
  tetap perlu diuji terhadap data Google Sheets nyata.
- Penutupan shift memeriksa PJ, status, item wajib, nilai handover, dan PIN;
  menulis handover/report/status/audit melalui beberapa operasi Sheets yang
  tidak atomik.
- Laporan normal dikunci lewat alur penutupan; koreksi tersedia melalui
  addendum di operasi admin. Route admin juga memiliki operasi shift sensitif
  seperti force-close, change-PJ, dan void.
- Audit log ditambahkan ke `AuditLog_YYYY-MM` dan hash dihitung dari entri
  sebelumnya pada tab itu. Sheets masih bisa diubah di luar aplikasi. Endpoint
  `/api/cron/verify` saat ini hanya mengecek secret dan tidak memverifikasi
  hash-chain; jadwal cron verifier tidak ditemukan.

## 5. PWA dan konektivitas

- `public/manifest.json` mendeklarasikan nama, ikon, dan mode standalone.
- `components/pwa-status.tsx` mendeteksi status online/offline, menangani
  install prompt bila browser menyediakan event, dan mendaftarkan `/sw.js`
  production.
- `public/sw.js` cache-first untuk app-shell assets yang dipilih, bukan data
  API. Tidak ditemukan service worker data cache atau offline write queue.
- Mutasi shift/checklist/incident/handover membutuhkan API jaringan; jangan
  menjanjikan sinkronisasi otomatis setelah offline.

## 6. API dan fitur yang terpetakan

Sumber route adalah `app/api/**/route.ts`. Area yang tersedia meliputi:

- auth, health, beranda, shift lifecycle/checklist/progress/handover;
- incident, laporan, token publik, upload/serve foto, notifikasi;
- admin branches/users/templates/settings/shift operations/reports/stats/audit.

Route handler masing-masing adalah sumber kebenaran untuk method, payload,
validation, dan authorization. Daftar route ringkas ada di
`content/docs/reference/api-endpoints.mdx`.

## 7. Verifikasi repository

`package.json` mendefinisikan:

```bash
npm run lint
npm run typecheck
npm run build
```

Audit 14 Oktober 2026 tidak menemukan script test atau file `*.test.*` /
`*.spec.*` aplikasi. Karena itu hasil typecheck/build tidak boleh dilaporkan
sebagai bukti skenario integrasi, keamanan, atau konkurensi telah lulus.

## 8. Dokumen historis

`REFACTOR.md` dan `plan-performance.md` menyimpan konteks/rencana lama.
Jangan ikuti bagian rencana PostgreSQL/Supabase/Drizzle/monorepo sebagai
arsitektur aktif. Catatan optimasi shift terkini dan batas verifikasinya ada
di `.PLAN/performa-mycheck.md`.
