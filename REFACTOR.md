# REFACTOR.md — mycheck → Google Sheets Backend

> **Goal:** Full refactor mycheck backend from PostgreSQL/Supabase to Google Sheets API, mirroring stokis architecture for maximum performance.

---

## Table of Contents

1. [Overview](#overview)
2. [Project Restructure: Monorepo → Flat](#project-restructure-monorepo--flat)
3. [Architecture Comparison](#architecture-comparison)
4. [Google Sheets Schema](#google-sheets-schema)
5. [Auth System Changes](#auth-system-changes)
6. [API Route Mapping](#api-route-mapping)
7. [Dependencies Changes](#dependencies-changes)
8. [File-by-File Refactor Plan](#file-by-file-refactor-plan)
9. [Implementation Phases](#implementation-phases)
10. [Testing Strategy](#testing-strategy)
11. [Rollback Plan](#rollback-plan)
12. [Risks & Mitigations](#risks--mitigations)

---

## 1. Overview

### Current State
- **Framework:** Next.js 14 App Router
- **Database:** Supabase PostgreSQL + Drizzle ORM (20+ tables)
- **Auth:** JWT (HS256) + Argon2id PIN + CSRF + Rate Limiting
- **Storage:** Supabase Storage + Google Drive
- **Caching:** None

### Target State
- **Framework:** Next.js 16 (upgrade)
- **Database:** Google Sheets API (per-branch spreadsheets)
- **Auth:** HMAC-SHA256 signed cookies + Plaintext PIN
- **Storage:** Google Drive (photos + XLSX reports)
- **Caching:** In-memory registry + branch cache

### Expected Performance Improvement
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Login | ~100ms (Argon2id) | ~1ms (plaintext) | **100x** |
| API Response | ~200-500ms | ~50-100ms | **3-5x** |
| Middleware Checks | 6 layers | 2 layers | **3x fewer** |
| DB Queries | JOIN 20+ tables | Flat sheet ops | **Simpler** |

---

## 2. Project Restructure: Monorepo → Flat

### 2.1 Problem: Dualisme Struktur

mycheck saat ini menggunakan struktur **monorepo** dengan `apps/web` sebagai sub-project terpisah. Ini menyebabkan:

- **Dualisme `.env`** — `mycheck/.env` (tidak dibaca Next.js) vs `mycheck/apps/web/.env` (yang sebenarnya dibaca)
- **Redundansi config** — `package.json`, `next.config.js`, `tsconfig.json` terduplikasi
- **Confusing imports** — path resolution berbeda antara root dan app level

### 2.2 Solusi: Flatten to Single Project

Restructure mycheck menjadi **flat structure** yang identik dengan stokis:

#### Before (Monorepo)
```
mycheck/
├── .env                    ← TIDAK dibaca Next.js
├── .env.example
├── .env.local
├── apps/
│   └── web/
│       ├── .env            ← INI yang dibaca
│       ├── .env.example
│       ├── .env.local
│       ├── app/            ← Next.js app directory
│       ├── lib/
│       ├── components/
│       ├── package.json    ← Sub-project root
│       ├── next.config.js
│       └── tsconfig.json
├── packages/
│   └── shared/             ← Shared code (tidak digunakan)
├── package.json            ← Workspace root
└── pnpm-workspace.yaml
```

#### After (Flat — Mirror stokis)
```
mycheck/
├── .env                    ← SATU-SATUNYA env file
├── .env.example
├── .env.local
├── app/                    ← Next.js app directory
├── lib/
├── components/
├── package.json            ← Project root
├── next.config.ts
├── tsconfig.json
└── ...
```

### 2.3 Mapping Files

| Before (Monorepo) | After (Flat) | Action |
|-------------------|--------------|--------|
| `apps/web/app/` | `app/` | Move |
| `apps/web/lib/` | `lib/` | Move |
| `apps/web/components/` | `components/` | Move |
| `apps/web/public/` | `public/` | Move |
| `apps/web/package.json` | `package.json` | Merge |
| `apps/web/next.config.js` | `next.config.ts` | Move + Convert to TS |
| `apps/web/tsconfig.json` | `tsconfig.json` | Move |
| `apps/web/.env` | `.env` | Move |
| `apps/web/.env.example` | `.env.example` | Move |
| `apps/web/.env.local` | `.env.local` | Move |
| `packages/shared/` | — | Delete (tidak digunakan) |
| `pnpm-workspace.yaml` | — | Delete (tidak perlu) |
| Root `package.json` | — | Delete (merge dengan apps/web) |

### 2.4 Steps to Restructure

1. **Move files dari `apps/web/` ke root**
   ```bash
   mv apps/web/app ./app
   mv apps/web/lib ./lib
   mv apps/web/components ./components
   mv apps/web/public ./public
   mv apps/web/package.json ./package.json
   mv apps/web/next.config.js ./next.config.ts
   mv apps/web/tsconfig.json ./tsconfig.json
   mv apps/web/.env ./.env
   mv apps/web/.env.example ./.env.example
   mv apps/web/.env.local ./.env.local
   ```

2. **Delete monorepo remnants**
   ```bash
   rm -rf apps/
   rm -rf packages/
   rm pnpm-workspace.yaml
   rm package.json  # root workspace package.json
   ```

3. **Update `tsconfig.json`** — remove path aliases untuk `packages/shared`

4. **Update `next.config.ts`** — pastikan semua path benar

5. **Update `package.json`** — pastikan semua dependencies benar

6. **Test** — pastikan aplikasi berjalan dengan baik

### 2.5 Benefits

| Benefit | Description |
|---------|-------------|
| **Single source of truth** | Satu `.env`, satu `package.json`, satu config |
| **Identical dengan stokis** | Struktur 100% mirror, mudah copy-paste code |
| **Simpler imports** | Tidak ada path aliases yang confusing |
| **Easier maintenance** | Satu project, satu config, satu deployment |
| **No dualisme** | Tidak ada lagi file redundant |

---

## 3. Architecture Comparison

### Before (mycheck)
```
Client → Next.js API → Middleware (JWT + CSRF + Rate Limit + Role + Branch)
                         ↓
                    Drizzle ORM → PostgreSQL (Supabase)
                         ↓
                    Supabase Storage (photos)
```

### After (stokis-style)
```
Client → Next.js API → Middleware (HMAC cookie + Branch check)
                         ↓
                    Google Sheets API (per-branch)
                         ↓
                    Google Drive (photos + XLSX)
```

---

## 3. Google Sheets Schema

### 3.1 Registry Spreadsheet (Global)

**Spreadsheet Name:** `MYCHECK_Registry`

| Sheet | Purpose | Columns |
|-------|---------|---------|
| `Daftar_Cabang` | Branch registry | Cabang_ID, Nama, Spreadsheet_ID, Folder_ID, Status |
| `Settings_Global` | Global settings | Key, Value, Updated_At |
| `Users` | All users across branches | User_ID, Nama, PIN, Role, Cabang_ID, Status |
| `Template_Referensi` | Template spreadsheet reference | Template_ID, Spreadsheet_ID |

### 3.2 Per-Branch Spreadsheet

**Spreadsheet Name:** `MYCHECK_{Cabang_ID}`

#### Sheet: `Shift_Definitions`
| Column | Type | Description |
|--------|------|-------------|
| Shift_ID | string | Unique shift definition ID |
| Nama | string | Shift name |
| Cabang_ID | string | Branch reference |
| Status | string | active/inactive |
| Created_At | datetime | Creation timestamp |

#### Sheet: `SOP_Categories`
| Column | Type | Description |
|--------|------|-------------|
| Category_ID | string | Unique category ID |
| Shift_ID | string | Parent shift definition |
| Nama | string | Category name |
| Urutan | number | Display order |

#### Sheet: `Checklist_Points`
| Column | Type | Description |
|--------|------|-------------|
| Point_ID | string | Unique point ID |
| Category_ID | string | Parent category |
| Nama | string | Checklist item name |
| Tipe | string | boolean/number/text/photo |
| Wajib | boolean | Required? |

#### Sheet: `Shift_Instances`
| Column | Type | Description |
|--------|------|-------------|
| Instance_ID | string | Unique instance ID |
| Shift_ID | string | Shift definition reference |
| Cabang_ID | string | Branch reference |
| Tanggal | date | Operational date |
| Shift | string | Morning/Evening/Night |
| Status | string | open/closed |
| Started_At | datetime | Start timestamp |
| Closed_At | datetime | Close timestamp |
| Started_By | string | User who opened |

#### Sheet: `Participants`
| Column | Type | Description |
|--------|------|-------------|
| Instance_ID | string | Shift instance reference |
| User_ID | string | Participant reference |
| Joined_At | datetime | Join timestamp |

#### Sheet: `Entries`
| Column | Type | Description |
|--------|------|-------------|
| Entry_ID | string | Unique entry ID |
| Instance_ID | string | Shift instance reference |
| Point_ID | string | Checklist point reference |
| Nilai | string | Value (yes/no/number/text/photo_url) |
| Timestamp | datetime | Entry timestamp |
| Input_By | string | User who input |

#### Sheet: `Handovers`
| Column | Type | Description |
|--------|------|-------------|
| Handover_ID | string | Unique handover ID |
| Instance_ID | string | Shift instance reference |
| From_Shift | string | Previous shift |
| To_Shift | string | Next shift |
| Catatan | string | Handover notes |
| Timestamp | datetime | Handover timestamp |

#### Sheet: `Reports`
| Column | Type | Description |
|--------|------|-------------|
| Report_ID | string | Unique report ID |
| Instance_ID | string | Shift instance reference |
| File_ID | string | Google Drive file ID |
| Share_Token | string | Public share token |
| Created_At | datetime | Creation timestamp |

#### Sheet: `Incidents`
| Column | Type | Description |
|--------|------|-------------|
| Incident_ID | string | Unique incident ID |
| Instance_ID | string | Shift instance reference |
| Kategori | string | Incident category |
| Deskripsi | string | Description |
| Status | string | open/closed |
| Created_By | string | Reporter |
| Created_At | datetime | Creation timestamp |

#### Sheet: `Audit_Log`
| Column | Type | Description |
|--------|------|-------------|
| Log_ID | string | Unique log ID |
| User_ID | string | User reference |
| Aksi | string | Action type |
| Detail | string | Action details |
| Timestamp | datetime | Action timestamp |

---

## 4. Auth System Changes

### 4.1 Before (Current)
```typescript
// lib/auth/session.ts
- Argon2id PIN hashing (CPU-intensive)
- JWT sign/verify (HS256)
- Server-side session table lookup
- CSRF protection (X-Requested-With header)
- Rate limiting (PIN fail tracking)
```

### 4.2 After (stokis-style)
```typescript
// lib/session.ts
- HMAC-SHA256 signed cookie (stateless)
- Plaintext PIN comparison
- No CSRF protection
- No rate limiting
```

### 4.3 Auth Flow

**Login:**
```typescript
// 1. Read user from Google Sheets (Users sheet)
// 2. Compare PIN: stored === pin (plaintext)
// 3. Create HMAC-SHA256 token: HMAC(userId + timestamp, SECRET)
// 4. Set cookie: session_token = {userId, timestamp, signature}
```

**Middleware:**
```typescript
// 1. Read session_token cookie
// 2. Verify HMAC signature
// 3. Check expiration
// 4. Load user from cache/memory
// 5. Check branch access
```

### 4.4 Session Token Format
```typescript
// Cookie value: base64(JSON payload).HMAC_SIGNATURE
// Payload: { userId, cabangId, role, exp }
// Signature: HMAC-SHA256(base64(payload), SESSION_SECRET)
```

---

## 5. API Route Mapping

### 5.1 Auth Routes

| Route | Before | After |
|-------|--------|-------|
| `/api/auth/login` | Argon2id verify + JWT | Plaintext PIN + HMAC cookie |
| `/api/auth/logout` | Delete session from DB | Clear cookie |
| `/api/auth/me` | JWT verify + DB lookup | HMAC verify + cache lookup |
| `/api/auth/change-pin` | Argon2id re-hash | Update plaintext in Sheets |

### 5.2 Shift Routes

| Route | Before | After |
|-------|--------|-------|
| `/api/shifts` | Drizzle query + JOIN | Google Sheets read |
| `/api/shifts/open` | INSERT + advisory lock | Google Sheets append |
| `/api/shifts/[id]` | SELECT with JOIN | Google Sheets read |
| `/api/shifts/[id]/entries` | INSERT + transaction | Google Sheets append |
| `/api/shifts/[id]/close` | UPDATE + lock | Google Sheets update |

### 5.3 Admin Routes

| Route | Before | After |
|-------|--------|-------|
| `/api/admin/branches` | Drizzle CRUD | Google Sheets CRUD |
| `/api/admin/users` | Drizzle CRUD | Google Sheets CRUD |
| `/api/admin/shifts` | Drizzle CRUD | Google Sheets CRUD |

### 5.4 Other Routes

| Route | Before | After |
|-------|--------|-------|
| `/api/reports` | PDF generation | XLSX generation (ExcelJS) |
| `/api/photos/upload` | Supabase Storage | Google Drive upload |
| `/api/incidents` | Drizzle CRUD | Google Sheets CRUD |

---

## 6. Dependencies Changes

### 6.1 Remove
```json
{
  "drizzle-orm": "^0.x",
  "postgres": "^3.x",
  "@supabase/supabase-js": "^2.x",
  "argon2": "^0.x",
  "serwist": "^0.x",
  "next-pwa": "^0.x"
}
```

### 6.2 Add
```json
{
  "googleapis": "^140.x",
  "exceljs": "^4.x"
}
```

### 6.3 Keep (Same)
```json
{
  "next": "^16.x",
  "react": "^19.x",
  "react-dom": "^19.x",
  "zod": "^3.x",
  "jose": "^5.x",
  "tailwindcss": "^4.x",
  "daisyui": "^5.x"
}
```

### 6.4 Final Dependencies (100% mirroring stokis)
```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "googleapis": "^140.0.0",
    "exceljs": "^4.4.0",
    "zod": "^3.23.0",
    "jose": "^5.9.0",
    "tailwindcss": "^4.0.0",
    "daisyui": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0"
  }
}
```

---

## 7. File-by-File Refactor Plan

### 7.1 New Files (Copy from stokis, adapt for mycheck)

| File | Source | Purpose |
|------|--------|---------|
| `lib/google/client.ts` | stokis | Google API client initialization |
| `lib/google/sheets.ts` | stokis | Sheets CRUD operations |
| `lib/google/registry.ts` | stokis | Registry spreadsheet resolver |
| `lib/google/drive.ts` | stokis | Google Drive operations |
| `lib/session.ts` | stokis | HMAC-SHA256 session management |
| `lib/auth.ts` | stokis | `withAuth()` HOF middleware |
| `lib/domain/shift-service.ts` | NEW | Shift business logic |
| `lib/domain/entry-service.ts` | NEW | Entry business logic |
| `lib/domain/report-service.ts` | NEW | Report generation (XLSX) |
| `lib/domain/user-service.ts` | NEW | User management |
| `lib/domain/incident-service.ts` | NEW | Incident management |
| `lib/domain/audit-service.ts` | NEW | Audit logging |

### 7.2 Modified Files

| File | Changes |
|------|---------|
| `middleware.ts` | Simplify to HMAC cookie check only |
| `app/api/auth/login/route.ts` | Replace Argon2id with plaintext PIN |
| `app/api/auth/logout/route.ts` | Clear cookie only |
| `app/api/auth/me/route.ts` | HMAC verify + cache lookup |
| `app/api/shifts/*/route.ts` | Replace Drizzle with Google Sheets |
| `app/api/admin/*/route.ts` | Replace Drizzle with Google Sheets |
| `app/api/reports/*/route.ts` | Replace PDF with XLSX |
| `app/api/photos/*/route.ts` | Replace Supabase with Google Drive |
| `next.config.ts` | Add security headers (copy from stokis) |
| `package.json` | Update dependencies |

### 7.3 Deleted Files

| File | Reason |
|------|--------|
| `lib/db/index.ts` | Remove Drizzle ORM |
| `lib/db/lock.ts` | Remove advisory locks |
| `lib/db/transaction.ts` | Remove transactions |
| `lib/db/idempotency.ts` | Remove idempotency checks |
| `lib/db/snapshot.ts` | Remove snapshot builder |
| `lib/db/server-time.ts` | Remove server time helper |
| `lib/auth/session.ts` | Replace with stokis-style |
| `lib/auth/guard.ts` | Replace with stokis-style |
| `lib/auth/middleware.ts` | Replace with stokis-style |
| `lib/auth/rate-limit.ts` | Remove rate limiting |
| `lib/auth/pin.ts` | Remove Argon2id |
| `lib/auth/sensitive-action.ts` | Remove sensitive action check |
| `lib/storage/index.ts` | Replace with Google Drive |
| `drizzle/schema.ts` | Remove Drizzle schema |
| `drizzle.config.ts` | Remove Drizzle config |

---

## 9. Implementation Phases

### Phase 0: Restructure (Day 1)

**Goal:** Flatten monorepo structure to mirror stokis

- [ ] Move `apps/web/app/` → `app/`
- [ ] Move `apps/web/lib/` → `lib/`
- [ ] Move `apps/web/components/` → `components/`
- [ ] Move `apps/web/public/` → `public/`
- [ ] Move `apps/web/package.json` → `package.json`
- [ ] Move `apps/web/next.config.js` → `next.config.ts`
- [ ] Move `apps/web/tsconfig.json` → `tsconfig.json`
- [ ] Move `apps/web/.env` → `.env`
- [ ] Move `apps/web/.env.example` → `.env.example`
- [ ] Move `apps/web/.env.local` → `.env.local`
- [ ] Delete `apps/` directory
- [ ] Delete `packages/` directory
- [ ] Delete `pnpm-workspace.yaml`
- [ ] Delete root `package.json` (workspace)
- [ ] Update `tsconfig.json` — remove path aliases
- [ ] Update `next.config.ts` — ensure paths correct
- [ ] Test — ensure app runs correctly

**Deliverable:** Flat structure identical to stokis

---

### Phase 1: Foundation (Days 2-4)

**Goal:** Setup Google Sheets structure + Auth system

- [ ] Create Registry spreadsheet (`MYCHECK_Registry`)
- [ ] Create per-branch spreadsheet template
- [ ] Copy `lib/google/client.ts`, `lib/google/sheets.ts`, `lib/google/registry.ts` from stokis
- [ ] Copy `lib/session.ts`, `lib/auth.ts` from stokis
- [ ] Update `middleware.ts` — simplify to HMAC cookie check
- [ ] Update `app/api/auth/login/route.ts` — plaintext PIN + HMAC cookie
- [ ] Update `app/api/auth/logout/route.ts` — clear cookie
- [ ] Update `app/api/auth/me/route.ts` — HMAC verify + cache
- [ ] Update `package.json` — remove old deps, add new deps
- [ ] Update `next.config.ts` — add security headers

**Deliverable:** Login/logout works with Google Sheets backend

---

### Phase 2: Core CRUD (Days 4-7) — ✅ DONE

**Goal:** Shift management + Entries + Handover

Note: implementasi tidak memakai `lib/domain/*-service.ts`; logika tetap berada
di route handler dengan lapisan akses data terpusat di `lib/store.ts`
(cocok dengan pola stokis).

- [x] `lib/google/branch-schema.ts` — header persis sama dengan `Template_cabang_mycheck`
- [x] `lib/store.ts` — CRUD + `ensureMonthlySheet` / `listMonthlyRows` untuk tab bulanan
- [x] `lib/db/snapshot.ts` — build snapshot dari `ShiftDefinitions` + `SopCategories` + `ChecklistPoints` + `HandoverFields`, toleransi dari `_meta`
- [x] `lib/db/audit.ts` — audit log hash-chain ke tab `AuditLog_<YYYY-MM>`
- [x] `lib/instance-resolver.ts` — resolusi instance + `tabMonth`
- [x] `app/api/shifts/route.ts` — list definisi shift + status hari ini
- [x] `app/api/shifts/open/route.ts` — buka shift (isi `tab_month` + `snapshot_encoding` + snapshot JSON)
- [x] `app/api/shifts/[id]/join/route.ts` — gabung shift
- [x] `app/api/shifts/[id]/entries/route.ts` — aksi checklist + idempotency + BR-12
- [x] `app/api/shifts/[id]/progress/route.ts` — progress per kategori + peserta
- [x] `app/api/shifts/[id]/handover/route.ts` — simpan handover
- [x] `app/api/shifts/[id]/handover-prev/route.ts` — baca handover shift sebelumnya
- [x] `app/api/shifts/[id]/close/route.ts` — tutup shift (verifikasi PIN) + buat report

**Deliverable:** ✅ Full shift lifecycle works — terverifikasi end-to-end
(login → list shift → open → join → entries → progress → handover → close)
terhadap `Template_cabang_mycheck`, lalu seluruh data test dihapus kembali.

**Catatan teknis penting (temuan saat implementasi):**
- Semua tulisan Sheets **wajib** `valueInputOption: 'RAW'`. Dengan `USER_ENTERED`,
  Google Sheets mengurai `"2026-10-08"` menjadi serial `46303` dan
  `"true"` menjadi boolean `TRUE` — merusak `shift_date`, `tab_month`, dan nilai centang.
- `updateRow` memakai `values.batchUpdate` multi-range (1 panggilan API untuk
  semua kolom yang diubah), bukan satu panggilan per kolom.
- `ShiftInstances.tab_month` wajib diisi saat membuka shift; seluruh data
  transaksional (Entries/EntryLogs/Handovers/AuditLog) tinggal di tab bulanan
  instance tersebut. `tabMonthOf()` jatuh ke `shift_date` lalu ke bulan berjalan.
- Hash chain audit di-reset per tab bulanan (bukan global) — perbedaan yang
  diterima terhadap desain PostgreSQL.

---

### Phase 3: Admin & Reports (Days 8-10) — ✅ DONE

**Goal:** Admin management + Report generation

**Lapisan servis (bukan `lib/domain/*`):**
- [x] `lib/google/registry-admin.ts` — CRUD `Daftar_Cabang` + `Users` di Registry (PascalCase)
- [x] `lib/google/settings-admin.ts` — CRUD `Settings_Global` + `_meta` per cabang
- [x] `lib/google/share-tokens.ts` — CRUD share token di sheet `Share_Tokens` (Registry)
- [x] `lib/admin/template-service.ts` — CRUD konfigurasi template cabang
- [x] `lib/admin/resolve-config.ts` — cari cabang pemilik sebuah ID config
- [x] `lib/admin/settings-catalog.ts` — katalog key + `value_type` (Settings_Global hanya Key|Value)
- [x] `lib/admin/sensitive-action.ts` — verifikasi PIN admin (versi Sheets)

**Routes:**
- [x] `app/api/admin/branches/*` — CRUD cabang + daftar shift per cabang + copy-from
- [x] `app/api/admin/users/*` — CRUD user, reset-pin, unlock, force-logout
- [x] `app/api/admin/shifts/*` — CRUD definisi shift, duplicate, categories, handover-fields, preview
- [x] `app/api/admin/sop-categories/*` — CRUD kategori, duplicate, points
- [x] `app/api/admin/checklist-points/*` — CRUD point + duplicate
- [x] `app/api/admin/handover-fields/[id]/route.ts` — CRUD bidang handover
- [x] `app/api/admin/settings/route.ts` — pengaturan global
- [x] `app/api/admin/stats/route.ts` — statistik lintas cabang
- [x] `app/api/admin/audit-log/route.ts` — audit log (gabungan tab bulanan)
- [x] `app/api/admin/reports/*` — daftar laporan, addenda, share token
- [x] `app/api/reports/*` — daftar laporan petugas + detail laporan
- [x] `app/api/public/report/[token]/route.ts` — laporan publik via token (tanpa auth)
- [x] `app/api/photos/upload` + `app/api/photos/[id]` — Drive upload & proxy akses

**Deliverable:** ✅ Terverifikasi end-to-end terhadap `Template_cabang_mycheck`
sebagai CBG01. Semua baris/setting/token test dibersihkan kembali.

**Perubahan perilaku yang disengaja (konsekuensi Sheets):**
- `force-logout` tidak bisa mencabut sesi stateless → dinonaktifkan akunnya.
- `unlock` jadi no-op (tidak ada lockout/rate limiting di versi ini).
- Pengaturan global pindah ke `Settings_Global` dengan katalog tipe di kode.
- `Settings_Global` + sheet `Share_Tokens` baru dibuat di Registry.
- Branch dibuat **nonaktif** sampai `Spreadsheet_ID` diisi, lalu bisa diaktifkan.
- Hapus shift/kategori/point diblokir bila punya anak atau sudah dipakai instance.
- Foto tidak memakai signed URL (file milik service account) — di-proxy lewat
  route terautentikasi agar URL tetap tertutup.
- Kolom arsip PDF (`archive_pdf_*`) tidak ada di template → dikembalikan `null`.

**Bug yang ditemukan & diperbaiki saat implementasi:**
- Branch id dibaca dari query string padahal ada di **path** URL → create shift selalu 400.
- Hapus definisi shift tidak mengecek anak (kategori/handover field) → meninggalkan
  baris yatim; sekarang diblokir 409.

---

### Phase 4: Remaining Features (Days 11-12) — ✅ DONE

**Goal:** Incidents + Notifications + Audit

Note: implementasi tidak memakai `lib/domain/*-service.ts`; logika tetap berada
di route handler dengan lapisan akses data terpusat di `lib/store.ts` +
`lib/incidents.ts` (cocok dengan pola stokis/Phase 2-3).
`lib/db/audit.ts` sudah versi Sheets (`appendAuditLogFor`), jadi tidak perlu
`audit-service.ts` baru.

- [x] `lib/google/branch-schema.ts` — sheet statis baru `IncidentCategories`
  + `lib/admin/template-service.ts` CRUD kategori per cabang
- [x] `lib/incidents.ts` — helper Phase 4: `findIncidentAcrossBranches`
  (IncidentIndex + fallback tab bulanan 3 bulan), `updateIncidentRow`
  (+sinkron index), `categoryNameMap`/`listActiveCategoriesAcrossBranches`,
  `userNameMap`, `pushNotification` (fan-out ke `Notifications` cabang),
  `upsertIncidentIndex`, `ensureIncidentTabs`
- [x] `lib/admin/resolve-config.ts` — `locateIncidentCategory`
- [x] `app/api/incidents/route.ts` — GET daftar (union kategori + index/fallback,
  limit 100) + POST buat (jendela 4 jam via `incident_link_window_hours`,
  outside_shift, severity, audit, notifikasi best-effort)
- [x] `app/api/incidents/[id]/route.ts` — GET detail + notes + photos;
  PATCH (admin) ubah status open↔selesai (IN-04) + audit + notifikasi
- [x] `app/api/incidents/[id]/notes/route.ts` — POST catatan (maks 2000, IN-06) + audit
- [x] `app/api/notifications/route.ts` — GET 50 terbaru lintas cabang
- [x] `app/api/notifications/[id]/read/route.ts` — POST tandai dibaca (idempotent)
- [x] `app/api/handovers/[id]/ack/route.ts` — POST ack idempotent + audit
- [x] `app/api/admin/incident-categories/*` — migrasi dari Drizzle ke Sheets
  (GET union + branchId, POST per cabang, PUT, DELETE dengan guard dipakai)
- [x] `app/api/admin/branches/[id]/copy-from/[source_id]/route.ts` — salin
  `IncidentCategories` bila target masih kosong
- [x] `app/api/reports/[id]/route.ts` — isi `categoryName` dari
  `IncidentCategories` (sebelumnya `null` placeholder Phase 2)

**Deliverable:** ✅ Feature parity petugas untuk incident/notifikasi/ack —
tsc + lint bersih. E2E terhadap Sheets (`Template_cabang_mycheck` sebagai
CBG01) + pembersihan data test masih perlu dijalankan manual.

**Perubahan perilaku yang disengaja (konsekuensi Sheets):**
- Kategori incident per cabang (bukan global); daftar petugas = union dedup nama.
- Notifikasi per cabang (fan-out saat create/status change), bukan tabel global.
- `IncidentIndex` statis mempercepat daftar; baris lama tanpa index tetap
  ditemukan via fallback scan 3 bulan terakhir.
- `PATCH /api/incidents/[id]` (admin) adalah endpoint baru — tidak ada di
  backend lama — untuk memenuhi PRD IN-04 (status oleh admin).
- `DELETE /api/admin/incident-categories/[id]` adalah endpoint baru dengan
  guard 409 bila kategori sudah dipakai incident.

**Di luar lingkup Phase 4 (legacy yang tersisa, bukan rute Phase 4):**
- ~~`app/admin/page.tsx` + `app/r/[token]/page.tsx` masih memakai Drizzle
  langsung~~ — ✅ **selesai di sesi lanjutan**, lihat "Perbaikan config & UI" di bawah.

### Perbaikan config & UI (sesi lanjutan Phase 4)

`tsconfig.json` sempat ditulis ulang sehingga kehilangan alias `@/*` dan lib `DOM`.
Akibatnya 791 error TypeScript dan 9 halaman + 2 komponen gagal render karena
`lib/db/index.ts` melempar error saat import (`DATABASE_URL` sudah dihapus dari `.env`).

- [x] `tsconfig.json` — kembalikan alias `"@/*": ["./*"]`, tambahkan `DOM` +
  `DOM.Iterable`, buang `@shared/*` yang menunjuk `packages/` yang sudah dihapus,
  exclude `apps` (duplikat) dan `drizzle` (yatim). **791 → 0 error.**
- [x] `lib/page-auth.ts` — auth Server Component (`requireUser` / `requireAdmin` /
  `getUser`) berbasis HMAC session `mycheck_session`, cermin `lib/api-auth.ts`
- [x] 9 halaman dipindah dari `lib/_deprecated-auth/*` ke `lib/page-auth.ts`
- [x] `lib/report-detail.ts` — detail laporan jadi satu sumber untuk
  `/api/reports/[id]`, `/api/public/report/[token]`, dan `app/r/[token]`
- [x] `lib/admin/stats-service.ts` — statistik dasbor jadi satu sumber untuk
  `/api/admin/stats` dan `app/admin/page.tsx`
- [x] `app/r/[token]/page.tsx` + `app/admin/page.tsx` — Drizzle diganti Sheets
- [x] Hapus 11 file mati: `lib/db/{index,lock,idempotency,transaction}.ts`,
  `lib/storage/`, `lib/_deprecated-auth/` (backup: `/tmp/opencode/removed`)
- [x] Sheet `IncidentCategories` ditambahkan ke template + 2 kategori lama di-seed

**Bug yang ditemukan saat verifiable:**
- Alias `@/*` + `DOM` hilang dari `tsconfig.json` → 380 modul gagal resolve.
- `lib/db/index.ts` throw saat import → semua halaman SSR crash.
- `lib/page-auth.ts` membaca cookie `session`, padahal `lib/session.ts` memakai
  `mycheck_session` → halaman selalu redirect ke `/login`.
- `outsideShift` tidak pernah dikirim di respons incident (list & detail).

**Verifikasi:**
- [Otomatis] `npx tsc --noEmit` → 0 error
- [Otomatis] `/api/health` → registry ok, storage ok
- [Otomatis] `/api/incidents` → kategori resolve, create → note → resolve → notifikasi → tandai dibaca
- [Otomatis] Halaman `/login` `/admin` `/report` `/incident` → 200 dengan sesi; `/` → 307 ke `/admin`
- [Otomatis] Data test dihapus: `Incidents_2026-10` 14 baris, `ShiftInstances` 49 baris (sesuai semula)

**Sisa legacy yang YATIM (menunggu persetujuan hapus):**
- `drizzle/` — `schema.ts`, 1 migration, 2 seed script. Dependensi PG sudah
  dihapus dari `package.json` sehingga mustahil dijalankan lagi.
- `apps/web/` — duplikat 158 file dari struktur sebelum Phase 0. `package.json`
  masih menunjuk `apps/web` sebagai workspace untuk script `dev`/`build`/`lint`.

---

### Phase 5: Optimization & Cleanup (Days 13-14) — ✅ DONE

**Goal:** Production-ready, optimized mycheck

**Cache:**
- [x] `lib/google/cache.ts` — utilitas TTL + single-flight (`ttlCache`, `memoize`)
- [x] `getCabangList()` + `resolveCabang()` di-cache 60 detik (sebelumnya cache
      per-proses tanpa batas waktu → data edit manual di Sheets tidak pernah
      terbaca ulang)
- [x] `listAllUsers()` di-cache 60 detik + single-flight. Sheet `Users` dibaca
      hampir di setiap request; sebelumnya **selalu** menembak API.
      Terukur: **0 ms** (cache) vs **99 ms** (cold)
- [x] Semua mutasi Registry/Users invalidate cache
      (`resetRegistryCache()` / `resetUsersCache()`)

**Batching:**
- [x] `readSheetsBatch()` di `lib/google/sheets.ts` (`values.batchGet`)
- [x] `filterRowsMulti()` di `lib/store.ts` — baca N sheet statis dalam 1 panggilan
- [x] `lib/admin/stats-service.ts` memakainya: 3 pembacaan sheet → 1 panggilan
      (hasil `/api/admin/stats` diverifikasi identik)

**Cleanup:**
- [x] `drizzle/` (schema, migration, 2 seed script) + `drizzle.config.ts` dihapus
- [x] `apps/` + `packages/` dihapus, script npm diarahkan ke root
- [x] File mati ditemukan lewat import-graph, dihapus: `components/ui/skeleton.tsx`,
      `components/ui/tabs.tsx`, `lib/branch.ts`, `lib/google/drive.ts`
- [x] `lib/drive/` (duplikat `lib/google/client.ts` dengan env var lama +
      `throw` di level modul) dihapus → `photos/upload` pakai `getDriveClient()`
- [x] `lib/auth.ts` (duplikat `withAuth`) dihapus → `change-pin` pindah ke `lib/api-auth.ts`
- [x] Label "v2.0 — Supabase PostgreSQL" di halaman login → "Google Sheets"
- [x] `.env.example` ditulis ulang (masih mendokumentasikan Supabase/PIN)

**Dokumentasi:**
- [x] `AGENTS.md` §4 Stack, §5 Aturan Data, §12 Perintah ditulis ulang;
      BR-01/05/12/43 dan aturan foto disesuaikan ke Sheets
- [x] `DATABASE_SCHEMA.md` ditulis ulang (890 baris skema PostgreSQL → skema Sheets)
- [x] `TRD.md` diberi banner v3 + tabel keputusan v2 vs v3, 8 bagian usang dipatch
- [x] `TESTING.md` §9 Data Layer ditulis ulang untuk guard Sheets
- [x] `IMPLEMENTATION_PLAN.md` diberi banner "SUDAH SELESAI" → arahkan ke REFACTOR.md
- [x] `PRD.md`, `UI-UX.md`, `APP_FLOW.md` **tidak diubah** (dokumen produk, masih valid)

**Verifikasi akhir:**
- [Otomatis] `npm run typecheck` → 0 error
- [Otomatis] `npm run lint` → No ESLint warnings or errors
- [Otomatis] `npm run build` → Compiled successfully, 40/40 static pages
- [Otomatis] `/api/health` → registry ok, storage ok
- [Otomatis] 9 endpoint inti + 4 halaman → 200
- [Otomatis] Siklus shift penuh: open → entries (termasuk rejections & idempotency)
      → handover → close → close-ulang 409
- [Otomatis] PIN di-reset → PIN lama langsung ditolak (bukan menunggu TTL cache)

**Sisa yang diketahui (bukan blocker):**
- Hash chain audit di-reset per tab bulanan.
- `npm run build` di mesin RAM < 4GB perlu `NODE_OPTIONS=--max-old-space-size=3072`.
- Race condition pada BR-01/BR-12 masih mungkin terjadi pada request benar-benar
  paralel (tidak ada unique index / row lock di Sheets).
- Warning `Found lockfile missing swc dependencies` dari Next 14 — build tetap jalan.

**Deliverable:** ✅ Production-ready

---

## 9. Testing Strategy

### 9.1 Unit Tests
- [ ] Auth: login, logout, session verify
- [ ] Shift service: create, open, close, join
- [ ] Entry service: add, update, delete
- [ ] Report service: generate XLSX

### 9.2 Integration Tests
- [ ] Full shift lifecycle: open → entries → handover → close
- [ ] User management: create, update, reset PIN
- [ ] Report generation: shift → report → share

### 9.3 Performance Tests
- [ ] Login latency < 5ms
- [ ] API response < 100ms (cached)
- [ ] API response < 300ms (uncached)
- [ ] Concurrent users: 50+ simultaneous

### 9.4 Regression Tests
- [ ] All existing features work
- [ ] No data loss
- [ ] Auth works correctly
- [ ] Branch isolation works

---

## 10. Rollback Plan

### Backup Location
- **Repo:** `myGroomy/mycheck-sheets` (current code backup)
- **New Repo:** `myGroomy/mycheck` (refactored code)

### Rollback Steps
1. If critical bug found, revert to `myGroomy/mycheck-sheets` repo
2. Redeploy old code from backup repo
3. Data is in Google Sheets — no migration needed back

### Data Safety
- All data stored in Google Sheets (exportable to CSV)
- Google Drive for file storage (photos, reports)
- No data loss risk (Google Sheets has version history)

---

## 11. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Google Sheets API rate limits | High | Medium | Implement caching, batch requests, retry logic |
| Data inconsistency | High | Medium | Implement idempotency via unique IDs |
| Security downgrade (PIN plaintext) | High | High | Restrict spreadsheet access, encrypt PIN with HMAC |
| Feature regression | Medium | High | Comprehensive testing, feature parity checklist |
| Performance not improved | Low | Medium | Benchmark before/after, optimize critical paths |
| Vercel serverless cold start | Medium | Medium | Optimize bundle size, use edge runtime |
| Google Sheets API downtime | High | Low | Implement retry logic, fallback to cache |

---

## 12. Success Criteria

- [ ] All features work as before
- [ ] Login latency < 5ms
- [ ] API response < 100ms (cached)
- [ ] API response < 300ms (uncached)
- [ ] Dependencies 100% mirror stokis (max 1-2 differences)
- [ ] No data loss
- [ ] Code is clean and maintainable
- [ ] Documentation is complete

---

## 14. Timeline Summary

| Phase | Days | Deliverable |
|-------|------|-------------|
| Phase 0: Restructure | 1 | Flat structure mirror stokis |
| Phase 1: Foundation | 2-4 | Auth + Google Sheets setup |
| Phase 2: Core CRUD | 5-8 | Shift management |
| Phase 3: Admin & Reports | 9-11 | Admin panel + reports |
| Phase 4: Remaining Features | 12-13 | Incidents + notifications |
| Phase 5: Optimization | 14 | Performance tuning |
| **Total** | **14 days** | **Production-ready** |

---

## 14. Notes

- **Data is dummy** — no migration needed, start fresh
- **Security downgrade acceptable** — plaintext PIN, no CSRF, no rate limiting
- **Backup exists** — `myGroomy/mycheck-sheets` repo
- **Target:** 100% dependency parity with stokis
- **Goal:** Maximum performance, minimum complexity

---

*Last updated: 2026-10-08*
*Author: AI Assistant*
*Status: Ready for implementation*
