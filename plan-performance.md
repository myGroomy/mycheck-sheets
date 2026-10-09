# Plan Performance Parity — `/mycheck` → kecepatan seperti `/stokis`

> **Tujuan:** Menaikkan performa & pengalaman loading `/mycheck` agar setara `/stokis`
> dengan **mempertahankan** sistem UI Radix + shadcn + token warna custom
> (`canvas`/`ink`/`surface`). **TIDAK** migrasi ke DaisyUI.
>
> **Strategi:** Performance parity — Next 16 + React 19 + Turbopack + Tailwind 4
> (sumber ~90% kecepatan STOKIS) + loading UI (skeleton/spinner).

---

## Diagnosis: Kenapa STOKIS Terasa Lebih Cepat

| Faktor | `/stokis` | `/mycheck` (sebelum) | Dampak |
|---|---|---|---|
| Next.js | 16.3.6 (**Turbopack** default dev) | 14.2.35 (Webpack) | Compile & HMR 2–10× lebih cepat |
| React | 19.2.8 | 18.3.1 | Rendering & hydration lebih efisien |
| TypeScript | 7.0.2 | 5.5.0 | Type-check & build lebih cepat |
| Tailwind | 4.3 (CSS-first) | 3.4 | Build CSS lebih ramping |
| Rendering | client shell + progressive fetch | SSR memblokir (nunggu Sheets) | Perceived load instan |
| Loading UI | skeleton/spinner | belum ada | Cepat terlihat |

**Catatan:** `/mycheck` justru punya cache Sheets (single-flight + TTL) yang lebih baik
dari STOKIS. Yang membuatnya terasa lambat adalah **SSR yang memblokir** + **Webpack/Next 14**,
bukan layer data. Rencana ini mempertahankan keunggulan cache tersebut.

---

## Perbedaan Arsitektur (ringkas)

- **Auth:** sama-sama pakai `cookies()` session HMAC + `AuthProvider`/`CabangProvider` client context.
- **Data:** sama-sama Google Sheets via Service Account (`lib/google/*`).
- **Rendering:** STOKIS client-centric (`"use client"` + `useEffect` fetch); MYCHECK campuran
  Server Component (async `getUser`/`requireUser`) + client fetch. Dipertahankan, tapi ditambah
  `loading.tsx` streaming agar shell terkirim duluan.

---

## Rencana Bertahap

### Fase 1 — Upgrade Framework Inti ✅ SELESAI (dampak kecepatan terbesar)

**Status: DONE** — `npm install` sukses (added 68 / removed 101 / changed 100). `tsc --noEmit` exit 0.

Versi terpasang: next 16.4.0, react/react-dom 19.3.0, typescript 7.0.2, zod 4.6.5,
googleapis 182.0.0, eslint 9.39.5, tw-animate-css 1.4.0.

Yang dikerjakan:
- `package.json`: semua versi dinaikkan (lihat bawah). `build` → `next build --webpack`.
- `next.config.js` → `next.config.ts` (hapus `serverComponentsExternalPackages`
  postgres/argon2 yang tak dipakai; tambah `experimental.useTypeScriptCli`; pertahankan
  `distDir` kondisional `.next-dev`).
- Perbaiki breaking change `cookies()` → async di `lib/page-auth.ts` & `app/layout.tsx`
  (`await cookies()`), sekaligus jadikan `RootLayout` async.

- `package.json`: next→16.3.6, react/react-dom→19.2.8, typescript→~7.0.2,
  eslint→^9, eslint-config-next→16.3.6, zod→^4.6.5, googleapis→^182.0.0,
  framer-motion→^13.4.0, lucide-react→^1.48.0, @types/node→^22,
  @types/react→^19, @types/react-dom→^19.
- Tambah `tw-animate-css` (pengganti `tailwindcss-animate`, kompatibel Tailwind 4).
- Hapus `tailwindcss-animate`.
- `next.config.js` → `next.config.ts`; hapus `serverComponentsExternalPackages`
  (`postgres`/`@node-rs/argon2` tidak dipakai). Tambah `experimental.useTypeScriptCli`.
- `scripts.build` → `next build --webpack` (samakan STOKIS, stabil produksi).
- Turbopack otomatis aktif untuk `next dev` (Next 16).

### Fase 2 — Migrasi Tailwind 3 → 4 (pertahankan token custom) ✅ SELESAI

**Status: DONE** — `npm run build` sukses (Compiled successfully, TS 2.5s, 45 static pages).
Tailwind 4 compile bersih, tidak ada className hilang (token dipetakan ke `@theme`).

Yang dikerjakan:
- `postcss.config.js` → `postcss.config.mjs` memakai `@tailwindcss/postcss`.
  Tambah devDep `@tailwindcss/postcss@^4.3.3`.
- `app/globals.css`: `@tailwind` → `@import "tailwindcss"` + `@import "tw-animate-css"`.
  Semua token warna (canvas/ink/surface + shadcn background/foreground/card/...) dan
  radius custom (sm/md/lg/xl/pill) dipetakan ke `@theme`. Base styles dibungkus `@layer base`.
  Tidak ada `@apply`/`theme()`/`dark:` di kode → migrasi aman.
- Ganti `tailwindcss-animate` → `tw-animate-css` (API class identik untuk dialog/select/sheet/dropdown).
- Hapus `tailwind.config.ts` (config CSS-first); `components.json` config → `""`.
- Bonus: perbaiki breaking change `params` → `Promise` + `await` di `app/report/[id]/page.tsx`,
  `app/incident/[id]/page.tsx`, `app/api/public/report/[token]/route.ts` (dulu memblokir build).

**Catatan untuk Fase 5:** Next 16 memperingatkan `middleware` deprecated → disarankan rename ke
`proxy` (`npx @next/codemod@canary middleware-to-proxy .`). Belum dilakukan (fungsi tetap jalan).
Next 16 juga otomatis mengubah `tsconfig.json` (`jsx: react-jsx`, tambah `.next/dev/types`).


### Fase 3 — Perbaikan Breaking Changes (WAJIB build hijau) ✅ SELESAI

**Status: DONE** — `npx tsc --noEmit` exit 0. Sweep menyeluruh: semua breaking change
Next 15/16 + zod 4 + React 19 tertangani.

Hasil sweep & verifikasi:
- `cookies()` → async: **DONE** di Fase 1 (`lib/page-auth.ts`, `app/layout.tsx`).
- `params` → `Promise` + `await`: **DONE** untuk `report/[id]`, `incident/[id]`,
  `api/public/report/[token]` (Fase 2). Sweep ulang: **tidak ada** `params: {` sync tersisa.
- `headers()`: tidak dipakai di codebase → N/A.
- `searchParams` server component: hanya `login/page.tsx` (client) — sudah dibungkus
  `<Suspense>` (wajib Next 15+). ✓
- **zod 4**: tidak ada API breaking (`z.record`, `.email()`, `.url()`, `z.coerce`,
  `z.nativeEnum`, `errorMap`) di codebase. Semua pakai `z.object/z.enum/z.string()...`
  yang kompatibel. `error.issues` (array) + `issue.path.join` tetap ada di zod 4.
  Diverifikasi **runtime** via `scripts/verify-zod4.ts` → 8/8 check PASSED.
- React 19 `forwardRef`: kompatibel (deprecated tapi jalan), tidak memblokir build.

Catatan (Fase 5): `middleware.ts` deprecated di Next 16 (sarankan rename → `proxy`).
Fungsi tetap jalan (build sukses, `ƒ Proxy (Middleware)`).


### Fase 4 — Loading UI (Skeleton + Spinner) ✅ SELESAI

**Status: DONE** — `tsc --noEmit` exit 0, `npm run build` sukses. Chunk `loading`
ter-generate untuk root/report/daftar-shift/incident/shift[id]; skeleton class
(`animate-pulse`, `bg-ink/10`) ter-compile ke CSS.

Yang dikerjakan:
- Baru `components/ui/skeleton.tsx` — primitif `<Skeleton>` (animate-pulse, a11y hidden).
- Baru `components/ui/skeletons.tsx` — layout skeleton siap-pakai:
  `SkeletonHeader`, `SkeletonStatGrid`, `SkeletonList`, `SkeletonLine`.
  Bentuk meniru konten asli → tanpa layout shift.
- `components/ui/spinner.tsx` — tambah `role="status"` + `aria-label="Memuat"` (a11y).
- `loading.tsx` streaming per route: `app/loading.tsx` (root), `app/report`,
  `app/daftar-shift`, `app/incident`, `app/shift/[id]`. Server Component tetap SSR,
  tapi shell + skeleton terkirim duluan → perceived load instan seperti STOKIS.
- `PetugasHome` — loading state spinner penuh → diganti skeleton (header+stat+list).


### Fase 5 — Linting & Verifikasi ✅ SELESAI (FASE TERAKHIR)

**Status: DONE** — `npm run lint` (oxlint) exit 0 (7 warnings, 0 errors, 80ms/185 files).
`npm run build` sukses (45/45 pages), warning `middleware deprecated` HILANG, route summary
menampilkan `ƒ Proxy (Middleware)`.

Yang dikerjakan:
- **Linting → oxlint** (samakan STOKIS). Temuan: `typescript-eslint` belum support
  TypeScript 7.0, jadi ESLint type-aware GAGAL load dengan TS 7. STOKIS memakai `oxlint`
  (linter Rust berbasis AST, tidak butuh TS compiler) — diadopsi. Hapus `eslint` +
  `eslint-config-next` dari devDeps (removed 291 pkg). Script `lint`: `next lint` → `oxlint`.
- **`middleware.ts` → `proxy.ts`** (Next 16 rename resmi). Fungsi `middleware` → `proxy`,
  logika & matcher identik. Warning deprecated hilang.

**Verifikasi akhir:**
- `npm run lint` (oxlint) → exit 0.
- `npx tsc --noEmit` → exit 0.
- `npm run build` → sukses, 45 static pages, 0 error.

---

## ✅ RINGKASAN AKHIR — Semua 5 Fase Selesai

| Fase | Isi | Status |
|---|---|---|
| 1 | Next 16 + React 19 + Turbopack + TS7 + zod4 + googleapis↑ | ✅ |
| 2 | Tailwind 4 (CSS-first, `@theme`, tw-animate-css) | ✅ |
| 3 | Breaking changes (cookies/params async, zod4 runtime) | ✅ |
| 4 | Loading UI (Skeleton + `loading.tsx` streaming) | ✅ |
| 5 | oxlint + `middleware`→`proxy` | ✅ |

**Hasil:** `/mycheck` kini setara `/stokis` dari sisi framework & kecepatan
(Turbopack dev, Tailwind 4, React 19) + perceived load (skeleton streaming),
TANPA mengubah sistem UI Radix + shadcn + token warna custom.

---

## 🧹 Pembersihan Data (di luar 5 fase) — Panel "Peringatan" & Cabang CBG01

**Masalah 1 — Panel "Peringatan" menampilkan shift basi.**
- Diagnosis (baca Registry langsung, bypass cache): sheet `Daftar_Cabang` hanya
  berisi `CBGBDG01` ("Cabang Pusat"), TAPI spreadsheet cabang itu sheet
  `ShiftInstances` masih menyimpan **49 baris data test**, **13 berstatus
  `berjalan`** yang tidak pernah ditutup & tanpa report → masuk panel Peringatan
  (`stats-service.ts` query TIDAK menyaring `is_test`).
- Perbaikan (Fase A): skrip `scripts/cleanup-berjalan-shifts.mjs` (DRY-RUN default,
  `apply` untuk eksekusi) meng-void 13 baris `berjalan` (set `status=void` +
  `void_reason/void_by/void_at`). Terverifikasi: **sisa `berjalan` = 0**.

**Masalah 2 — Cabang "CBG01" masih muncul (dibahas terpisah).**
- Diagnosis: `Daftar_Cabang` bersih (hanya `CBGBDG01`), TAPI 9 user di sheet
  `Users` masih ber-`Cabang_ID="CBG01BDG, CBG02CMH"` → jadi sumber `session.cabangId`
  (cookie 7 hari) untuk petugas. Belum ditindaklanjuti (menunggu keputusan user).

**Catatan cache:** kedua pembersihan menulis LANGSUNG ke Sheets, jadi cache
in-memory (`registry.ts` TTL 60s, `sheets.ts` TTL 15s) tidak auto-invalidate.
UI segar setelah TTL habis / restart server / logout-login (untuk cookie session).

**Rekomendasi kode (Fase B, belum dikerjakan):** filter `is_test=true` di
`stats-service.ts` agar data test tak mencemari dasbor; validasi `branchIds`
terhadap Registry di `api-auth.ts`/`page-auth.ts` (jangan percaya cookie buta).

### Tugas lanjutan (sesi ini)
- **Selaraskan `Users.Cabang_ID`:** 9 user di sheet `Users` semula
  `CBG01BDG, CBG02CMH` (tidak ada di `Daftar_Cabang`) → diubah ke `CBGBDG01`
  (cabang aktif valid) via `scripts/fix-users-cabang.mjs` (DRY-RUN default).
  Terverifikasi: ke-9 user kini `CBGBDG01`.
- **Kolom Spreadsheet & Folder Drive jadi tombol link** (`app/admin/cabang/page.tsx`):
  komponen `CopyableId` → `LinkableId`. Sekarang `<a target="_blank">` mengarah ke
  `https://docs.google.com/spreadsheets/d/{id}/edit` dan
  `https://drive.google.com/drive/folders/{id}`, plus tombol salin ID tetap ada.
  `tsc --noEmit` exit 0.
- **Skrip pembersih:** `scripts/cleanup-berjalan-shifts.mjs` (void shift test
  berjalan), `scripts/fix-users-cabang.mjs` (selaraskan Cabang_ID user).

**Catatan cache:** semua skrip menulis LANGSUNG ke Sheets, cache in-memory
(TTL 15–60s) tidak auto-invalidate; untuk perubahan sesi user (cabang), petugas
perlu **logout–login** agar cookie `cabangId` ter-refresh.


---

## Urutan Aman
1 → 3 (fungsi tetap jalan) → 2 (styling) → 4 (loading) → 5 (verifikasi).

## Asumsi
- React 19 + Radix UI versi MYCHECK kompatibel.
- `tw-animate-css` drop-in untuk `tailwindcss-animate`.
- Backup via git branch baru sebelum mulai.
