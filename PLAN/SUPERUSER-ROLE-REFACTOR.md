# Rencana: Model Superuser (admin = petugas + privilege) &amp; Penyatuan Halaman Incident/Checklist

> **Status dokumen:** RENCANA. Belum ada implementasi.
>
> Legenda status yang dipakai di dokumen ini:
>
> - **\[SAH\]** — fakta terverifikasi di source code pada saat dokumen ditulis
> - **\[RENCANA\]** — yang hendak dikerjakan
> - **\[BELUM DIUJI\]** — belum dijalankan/diuji, jangan dianggap lulus

---

## 0. Ringkasan

Dua osmotic yang disepakati:


| #   | Keputusan                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Model role: **admin = petugas + privilege.** Admin boleh melakukan seluruh aksi petugas, kecuali yang secara eksplisit dibatasi.            |
| 2   | Konteks cabang: admin memilih dan dapat **mengganti "cabang kerja"**, persisten lintas halaman dan reload.                                  |
| 3   | Penyatuan halaman **Incident** (Riwayat + Kategori) dan **Checklist** (Riwayat + Builder SOP), mengikuti pola Handover yang sudah berjalan. |


Temuan terpenting: **\[SAH\]** otorisasi API **sudah** memakai model superuser.
Yang belum ada hanya konteks cabang. risiko utama perubahan ini bukan izin —
tetapi data yang ditulis ke cabang yang salah.

---

## 1. Analisis Kondisi Saat Ini

### 1.1 Otorisasi API sudah superuser — \[SAH\]

Tidak ada satu pun API petugas yang menolak admin.

```ts
// lib/api-auth.ts:49
if (options?.requiredRole && session.role !== options.requiredRole && session.role !== 'admin')
  → 403

// lib/api-auth.ts:89
if (authCtx.user.role !== requiredRole && authCtx.user.role !== 'admin')
  → 403

// lib/api-auth.ts:102
if (authCtx.user.role === 'admin') return null;   // bypass requireBranchAccess
```

Route petugas yang hanya memakai `withAuth` (tanpa `requiredRole`) dan karena
itu terbuka untuk admin: **\[SAH\]**


| Route                                                 | Gate                               |
| ----------------------------------------------------- | ---------------------------------- |
| `app/api/shifts/route.ts`                             | `withAuth`                         |
| `app/api/shifts/open/route.ts:26`                     | `withAuth`                         |
| `app/api/shifts/[id]/join/route.ts:15`                | `withAuth` + `requireBranchAccess` |
| `app/api/shifts/[id]/entries/route.ts:141`            | `withAuth` + `requireBranchAccess` |
| `app/api/shifts/[id]/close/route.ts:27`               | `withAuth` + `requireBranchAccess` |
| `app/api/incidents/route.ts:31` (GET) / `:106` (POST) | `withAuth` + `requireBranchAccess` |


Artinya admin **sudah bisa** membuka shift, mengisi checklist, menutup shift, dan
membuat incident. Tidak ada pekerjaan backend untuk izin.

### 1.2 Yang memblokir hanya redirect halaman — dan sudah bolong — \[SAH\]


| Halaman                        | Admin diblokir?                |
| ------------------------------ | ------------------------------ |
| `app/page.tsx:11`              | ya → `/admin`                  |
| `app/daftar-shift/page.tsx:10` | ya → `/admin`                  |
| `app/handover/page.tsx:22`     | ya → `/admin/handover`         |
| `app/incident/page.tsx:5`      | **tidak** (`requireUser` saja) |
| `app/report/page.tsx:5`        | **tidak**                      |
| `app/incident/baru/page.tsx:5` | **tidak**                      |
| `app/shift/[id]/page.tsx:10`   | **tidak**                      |


Ketiga redirect di atas tidak konsisten dengan halaman lain yang membiarkan admin
masuk. Aturan "admin bukan petugas" selama ini tidak ditegakkan secara utuh.

### 1.3 Penghalang sesungguhnya: `branchIds` admin = semua cabang — \[SAH\]

```ts
// lib/api-auth.ts:57-60
if (session.role === 'admin') {
  branchIds = cabangs.map((c) => c.Cabang_ID);
}
```

Petugas mendapat `branchIds` dari penugasan akun. Admin mendapat **seluruh** cabang.
Akibatnya `ctx.branchIds[0]` tidak punya makna "cabang saya" bagi admin — dia
sekadar cabang pertama secara alfabetis.

### 1.4 Bug #1 — `branchIds[0]` pada pembuatan incident — \[SAH\]

`app/api/incidents/route.ts:144-146`:

```ts
} else {
  branchId = ctx.branchIds[0] ?? null;
}
```

Dan `branchId` **tidak pernah dikirim dari form** —
`components/incident/incident-create-form.tsx:92` mengirim:

```ts
JSON.stringify({ categoryId, description, occurredAt, severity, shiftInstanceId, outsideShift })
```

Select "Cabang" pada form tersebut hanya menyaring daftar shift, lalu dibuang.
Selama ini aman karena petugas umumnya satu cabang. **Begitu admin membuat
incident di luar shift, incident masuk ke cabang alfabetis pertama tanpa
peringatan apa pun.**

### 1.5 Bug #2 — SALAH: implementasi ini adalah dead code — \[SAH\], dikoreksi

> **Koreksi 2026-10-15.** Analisis awal menyimpulkan ada bug di
> `lib/domain/shift-service.ts:297-316` (`openShiftOnBehalf` memakai
> `ctx.branchIds[0]`). **Kesimpulan itu salah.** Modul tersebut tidak diimpor
> siapa pun di repository — `grep -rn "domain/shift-service"` hanya mencocokkan
> baris komentarnya sendiri. Implementasi yang benar-benar berjalan adalah
> `lib/admin/shift-operations.ts:339`, yang sudah menerima `branchId` secara
> eksplisit dan memvalidasi aksesnya.
>
> usang yang tidak terpakai dan berisi versi bermasalah dari logika yang sama.

Rekomendasi: **hapus `lib/domain/shift-service.ts`**. File ini duplikat dari
`lib/admin/shift-operations.ts` dengan perbedaan tanda tangan yang justru salah. Kalau
suatu saat ada yang mengimpornya kembali, bug `branchIds[0]` yang tadinya
"dormant" akan hidup kembali. Penghapusan ini sengaja **tidak** dibundel ke
Phase 1 agar diff tetap fokus — tetapi sebaiknya segera.

### 1.6 Penugasan cabang untuk admin adalah data mati — \[SAH\]

```ts
// app/api/admin/users/route.ts:87
const effectiveBranchIds = role === 'admin' ? [] : branchIds;
```

Sistem **sengaja** mengosongkan `branchIds` untuk admin. Artinya:

- Admin tidak punya "cabang induk" sama sekali.
- Field cabang di form `/admin/akun` diisi, tapi tidak pernah dipakai untuk role admin.
- Konsekuensinya, "cabang kerja" admin harus datang dari mekanisme baru
(Phase 1), **bukan** dari data akun yang sudah ada.

### 1.7 "Builder laporan" tidak pernah ada — \[SAH\]

Tidak ada `report_template` / `ReportTemplate` di `lib/` maupun `app/`. Laporan
dihasilkan otomatis saat shift ditutup. Isi `/admin/laporan` saat ini hanya:
filter, buat/cabut share link, export CSV, share WhatsApp, paginasi — itu
**privileged action**, bukan builder. Cakupan telah dikoreksi menjadi **checklist**.

### 1.8 Efek samping lain dari superuser — \[SAH\], perlu diputuskan


| Lokasi                                                   | Perilaku sekarang                                                | Pertanyaan                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `app/layout.tsx:70`                                      | `maintenance && role !== 'admin'` → admin lolos maintenance      | Kalau admin bisa jadi petugas, apakah admin masih bolehなくなる working saat maintenance? |
| `app/admin/akun/page.tsx` &amp; `users/[id]/route.ts:74` | Ada proteksi agar admin terakhir tidak dinonaktifkan/didemosikan | Tetap dijaga — tidak terkait perubahan ini.                                           |
| `app/api/admin/incident-categories/route.ts:63`          | `body.branchId ?? ctx.branchIds[0]`                              | Sudah menerima `branchId` eksplisit; konsisten dengan arah Phase 1.                   |


---

## 2. Prinsip yang Diterapkan


| Prinsip                               | Aturan                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baca ≠ Tulis**                      | Admin tetap membaca **semua** cabang (fungsi pengawasan). Ini tidak boleh hilang — test `admin boleh membaca handover cabang mana pun` harus tetap lulus. |
| **Tulis wajib eksplisit**             | Aksi tulis-as-petugas wajib punya cabang yang tidak ambigu. Kalau ambigu → `400` dengan pesan jelas.                                                      |
| **Jangan menebak**                    | Setiap `ctx.branchIds[0]` pada jalur tulis diganti validasi eksplisit.                                                                                    |
| **Route lama tetap hidup**            | Perpindahan halaman memakai redirect, bukan penghapusan.                                                                                                  |
| **Pindahkan dulu, refactor menyusul** | File besar dipindah tanpa modifikasi lain agar diff bisa direview.                                                                                        |


---

## 3. Phase 1 — Konteks Cabang Kerja (Fondasi)

> **STATUS: SELESAI (2026-10-15).** Lihat §3.6 untuk hasil aktual dan
> penyimpangan dari rencana awal.

> **Harus selesai lebih dulu.** Phase 2–4 bergantung padanya. Kalau urutan
> dibalik, admin akan bisa membuka shift tanpa tahu cabang mana yang dipakai.

### 3.1 Provider — \[RENCANA\]

```
lib/working-branch.tsx        (file baru)
  WorkingBranchProvider
  useWorkingBranch() → {
    branchId: string | null,
    setBranchId: (id: string) => void,
    isAdmin: boolean,
    branches: AdminBranch[],
    requiresSelection: boolean,   // admin && belum pilih
  }
```

Keputusan implementasi:


| Aspek                | Pilihan                                      | Alasan                                                                                                                                        |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sumber daftar cabang | `useCabang().branches` — sudah dimuat global | Tidak perlu fetch baru                                                                                                                        |
| Persistensi          | **cookie** `mycheck_working_branch`          | `sessionStorage` tidak terlihat Server Component → hydration mismatch + flicker "Memuat..." tiap navigasi. Cookie konsisten SSR &amp; client. |
| Nilai awal           | cookie yang ada, else cabang pertama         | Admin baru tetap bisa langsung bekerja                                                                                                        |
| Scope                | hanya role admin                             | Petugas memakai cabang penugasannya sendiri                                                                                                   |


Pemasangan: di dalam `AuthProvider` pada `app/layout.tsx`, supaya tersedia untuk
semua halaman.

### 3.2 Penempatan UI — \[RENCANA\]

`NavbarClient` menampilkan blok user **hanya di mobile** (`md:hidden`); desktop
menaruh user di footer sidebar (`NavbarClient.tsx:149-171`).

- **Pilihan A (disarankan):** di desktop, ganti blok nama+role di footer sidebar
dengan selector "Cabang kerja". Ruang cukup, tinggi header tidak bertambah.
- Pilihan B: dropdown cabang di header untuk semua role — Scouts\_break kesederhanaan header.

### 3.3 Penguatan API — \[RENCANA\] (wajib, bukan opsional)


| Route                                                   | Perubahan                                                                                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/incidents`                                   | Terima `branchId` di body. Role admin tanpa `branchId` → `400 { error: 'Pilih cabang kerja terlebih dahulu.' }`. **Hapus** `ctx.branchIds[0]` di `:145`. Tetap validasi `requireBranchAccess` bila `branchId` dikirim. |
| `POST /api/shifts/open`                                 | Terima `branchId` opsional. Bila dikirim, validasi cocok dengan cabang dari `shiftDefinitionId`. Admin tanpa `branchId` → `400`.                                                                                       |
| `openShiftOnBehalf` (`lib/domain/shift-service.ts:303`) | Ganti `ctx.branchIds[0]` dengan `params.branchId` yang tervalidasi. Ini sekaligus **menyembuhkan Bug #1.5**.                                                                                                           |
| `POST /api/shifts/[id]/close`, `.../entries`            | Tidak diubah — cabang ter-resolve dari shift id.                                                                                                                                                                       |
| `requireBranchAccess`                                   | **Tidak diubah.** Admin tetap boleh baca semua cabang.                                                                                                                                                                 |


### 3.4 Perbaikan form incident — \[RENCANA\]

`components/incident/incident-create-form.tsx`:

- Kirim `branchId` pada body POST (menyembuhkan Bug #1.4)
- Untuk admin: `<select>` wajib, default ke `useWorkingBranch()`
- Tampilkan baris konfirmasi "Incident akan dicatat pada cabang **X**" supaya
tidak ambigu sebelum submit

### 3.5 Test — \[RENCANA\]

```
tests/working-branch.test.ts     (baru) — 9 test, semua lulus
  - admin POST /api/incidents tanpa branchId        → 400
  - admin POST /api/incidents dengan branchId       → 200, masuk spreadsheet cabang itu
  - petugas POST /api/incidents tanpa branchId     → tetap 200 (branchIds[0] = cabangnya)
  - petugas POST /api/incidents ke cabang luar      → 403
  - incident terikat shift mengabaikan branchId body → 404 (shift tak dikenal)
  - admin POST /api/shifts/open tanpa branchId     → 400
  - admin POST /api/shifts/open dengan branchId benar → 200
  - admin POST /api/shifts/open dengan branchId salah → 404 (definisi tidak dicari di cabang lain)
  - petugas POST /api/shifts/open tanpa branchId    → tetap 200
```

### 3.6 Hasil aktual vs rencana — \[SAH\]

Penyimpangan dari rancana awal, dan alasannya:


| Poin                      | Rencana                                                                   | Aktual                                                     | Alasan                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-default cabang       | "Nilai awal: cookie, atau cabang pertama bila admin belum pernah memilih" | **Tetap sama**, diimplementasikan di efek provider         | Lebih baik UX, dan tidak pernah membuat admin tersedak.                                                                                                     |
| `requiresSelection`       | Didefinisikan sebagai "admin belum memilih"                               | Dipertahankan, tapi perannya menjadi **guard defensif**    | Dengan auto-default, kondisi ini praktis tidak terjadi. Yang benar-benar mencegah data salah cabang adalah penolakan 400 di API untuk pemanggilan langsung. |
| `openShiftOnBehalf`       | "Ganti `ctx.branchIds[0]`"                                                | **Tidak diubah**                                           | Implementasi yang jalan (`lib/admin/shift-operations.ts`) sudah benar; yang bermasalah adalah dead code (§1.5).                                             |
| Penempatan selector       | "Pilihan A: footer sidebar desktop"                                       | **Desktop sidebar + drawer "Lainnya" mobile**              | Kalau hanya desktop, admin di ponsel tidak akan bisa mengganti cabang sama sekali.                                                                          |
| Konfirmasi cabang di form | Disyarankan di §3.4                                                       | Ditambahkan di form incident                               | Guard terkuat: nama cabang tampil tepat sebelum submit.                                                                                                     |
| `POST /api/shifts/open`   | "validasi cocok dengan cabang dari shiftDefinitionId"                     | Pencarian definisi **dibatasi** ke `branchId` yang dikirim | Lebih ketat dan lebih murah: definisi tidak lagi dicari di cabang lain lalu ditemukan di sana.                                                              |


---

## 4. Phase 2 — Penyatuan Peran

> **STATUS: SELESAI (2026-10-15).** Lihat §4.3 untuk hasil audit aktual.

### 4.1 Hapus blokir — \[RENCANA\]


| File                           | Aksi                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `app/handover/page.tsx:22`     | Hapus `if (ctx.user.role === 'admin') redirect('/admin/handover')`                                                        |
| `app/daftar-shift/page.tsx:10` | Hapus `if (ctx.user.role === 'admin') redirect('/admin')`                                                                 |
| `app/page.tsx:11`              | **Dipertahankan** — admin diarahkan ke `/admin` sebagai beranda. Yang dihapus adalah sifat eksklusifnya, bukan arahannya. |
| `components/AuthGuard.tsx:36`  | `user.role === 'admin' ? '/admin' : '/'` — konsisten dengan `app/page.tsx`, tidak diubah.                                 |


### 4.2 Audit ulang titik role check — \[SAH\], selesai

Audit seluruh titik `role === 'admin'` / `requireRole` setelah Phase 2:


| Lokasi                                                 | Keputusan                     | Alasan                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `app/handover/page.tsx`                                | **Redirect dihapus**          | Admin boleh memakai pengalaman petugas. `/admin/handover` tetap ada sebagai versi ber-Tab Builder, bukan area eksklusif.                  |
| `app/daftar-shift/page.tsx`                            | **Redirect dihapus**          | Sama. Admin tetap punya beranda di `/admin`; jalur petugas tidak perlu ditutup.                                                           |
| `app/page.tsx:11`                                      | **Dipertahankan**             | Admin diarahkan ke `/admin` karena itu berandanya. Yang dihapus sifat eksklusifnya, bukan arahannya.                                      |
| `components/AuthGuard.tsx:36`                          | **Dipertahankan**             | Konsisten dengan `app/page.tsx`.                                                                                                          |
| `app/admin/layout.tsx`                                 | **Dipertahankan**             | Area `/admin/*` memang khusus admin.                                                                                                      |
| `app/layout.tsx:77` (maintenance)                      | **Dipertahankan**             | Admin tetap boleh masuk saat maintenance supaya bisa menonaktifkannya. Ini juga rekomendasi di §13, jadi pertanyaan itu terjawab: **ya**. |
| `PATCH /api/incidents/[id]`                            | **Dipertahankan** admin-only  | Mengubah status / mengaitkan incident ke shift adalah triage, bukan pekerjaan petugas. Ini privilege yang wajar.                          |
| Seluruh `/api/admin/*`                                 | **Dipertahankan**             | `requireRole(ctx,'admin')` sudah benar.                                                                                                   |
| `app/admin/akun/page.tsx` (badge role)                 | **Dipertahankan**             | Tampilan saja.                                                                                                                            |
| `app/admin/operasi-shift/page.tsx:305,310`             | **TIDAK diubah** — lihat §4.3 | Melonggarkan filter ini hanya akan memindahkan kegagalan ke server.                                                                       |
| `app/api/admin/users/route.ts:87` + `[id]/route.ts:99` | **Dipertahankan**             | Lihat §4.3.                                                                                                                               |
| `NavbarClient.tsx`, `lib/nav-config.ts`                | Menunggu Phase 5              | Navigasi.                                                                                                                                 |


### 4.3 "Admin bisa jadi PJ" — **TIDAK MUNGKIN** tanpa perubahan model data — \[SAH\]

Rencana awal menandai filter kandidat PJ di
`app/admin/operasi-shift/page.tsx:305,310` untuk ditinjau dengan asumsi
"dengan superuser, admin juga bisa jadi PJ". Setelah ditelusuri, asumsi itu
**keliru**. Admin belum bisa menjadi PJ, dan bukan karena UI:

```ts
// app/api/admin/users/[id]/route.ts:98-99
const effectiveRole = role ?? existing.Role;
updates['Cabang_ID'] = effectiveRole === 'admin' ? '' : branchIds.join(',');
```

`Cabang_ID` setiap akun admin **selalu kosong** (di jalur create
`users/route.ts:87` juga Likewise). Sementara validasi server
`assertUserHasBranchAccess` — dipakai `changePj` dan `openShiftOnBehalf` —
menuntut target punya `Cabang_ID` yang memuat cabang tersebut:

```ts
const akses = asStr(target.Cabang_ID).split(',').map((s) => s.trim()).filter(Boolean);
if (!akses.includes(branchId)) return { ok: false, error: `User tidak punya akses ke cabang ${branchId}.` };
```

Admin **selalu** akan ditolak dengan *"User tidak punya akses ke cabang X"*.

**Keputusan Phase 2: filter `role === 'petugas'` dibiarkan apa adanya.**
Melonggarkannya hanya memindahkan kegagalan dari UI ke server — pengguna
memilih admin sebagai PJ lalu mendapat pesan error yang membingungkan, tanpa
jejak bahwa itu keputusan sistem.

**Prasyarat agar fitur ini bisa hidup:**

1. Admin boleh punya penugasan cabang (`Cabang_ID` tidak lagi dipaksa kosong).
2. `withAuth`/`requireBranchAccess` harus diubah supaya admin tetap punya akses
 baca **seluruh** cabang walaupun punya daftar penugasan — kalau tidak,
 Phase 1 WorkingBranchProvider ikut rusak karena daftar cabangnya menyusut.

Poin (2) mudah terlewat dan dampaknya besar: memperbaiki (1) tanpa (2) akan
menyemperit admin ke cabang penugasannya dan membatalkan Phase 1. Perubahan ini
lebih besar dari Phase 2 dan sebaiknya punya plan sendiri.

### 4.4 Test — \[SAH\]

```
tests/superuser-role.test.ts   (baru) — 6 test, semua lulus
  - admin MELEWATI requireRole(ctx,'petugas')       → null
  - admin MELEWATI requireBranchAccess semua cabang  → null (oversight utuh)
  - petugas DITOLAK requireRole(ctx,'admin')        → 403
  - petugas DITOLAK requireBranchAccess luar cabang → 403
  - petugas BOLEH requireBranchAccess cabangnya     → null
  - route admin: petugas → 403, admin → bukan 403
```

Kontrak superuser diuji di kedua sisinya. Sisi "admin lebih tinggi" memakai unit
test helper (cepat, deterministik); sisi "petugas tidak dapat privilege" memakai
route sungguhan, bukan stub, supaya yang diuji bukan tautan ke tester.

> **Catatan teknis:** `tests/superuser-role.test.ts` harus meng-import
> `lib/api-auth` secara dinamis lewat helper `auth()`, bukan statis. Import
> statis dievaluasi lebih dulu dan membinding `getSessionFromRequest` asli
> sebelum `installSessionStub()` berjalan, sehingga route selalu melihat sesi
> kosong. Top-level await tidak bisa dipakai karena tsx mentransformasi file
> ke CJS.

---

## 5. Phase 3 — Penyatuan Halaman Incident

> **STATUS: SELESAI (2026-10-16).** Struktur sudah lengkap:
> `layout.tsx`, `page.tsx` (Riwayat), `kategori/page.tsx` (builder),
> redirect `/admin/kategori-incident`, dan `incident-section-tabs.tsx`
> diupdate. Nav `aliases` sudah mencakup `/admin/incident/kategori`.

Mengikuti pola Handover yang sudah berjalan.

### 5.1 Struktur baru — \[RENCANA\]

```
app/admin/incident/
  layout.tsx           (baru)  shell + judul + tab
  page.tsx             (pindah isi dari app/admin/incident/page.tsx)
  kategori/page.tsx    (pindah dari app/admin/kategori-incident/page.tsx)
```

### 5.2 Perpindahan file — \[RENCANA\]

```
git mv app/admin/kategori-incident/page.tsx app/admin/incident/kategori/page.tsx
```

`components/admin/incident-section-tabs.tsx` diupdate: `Kategori` →
`/admin/incident/kategori`. Halaman kategori **tidak lagi** merender tab itu
sendiri karena layout sudah menyediakan.

### 5.3 Backward compatibility — \[RENCANA\]

```ts
// app/admin/kategori-incident/page.tsx
export default function LegacyKategoriPage() {
  redirect('/admin/incident/kategori');
}
```

### 5.4 Halaman petugas — \[RENCANA\]

`app/incident/page.tsx` **tidak diubah**. Admin yang membukanya otomatis mendapat
pengalaman petugas; tidak perlu redirect.

---

## 6. Phase 4 — Penyatuan Halaman Checklist

> **STATUS: SELESAI (2026-10-16).** `layout.tsx`, `page.tsx` (Riwayat),
> dan `ChecklistSectionTabs` sudah ada; sesi ini memindahkan
> `checklist-builder/page.tsx` → `checklist/builder/page.tsx`, membuat
> redirect `/admin/checklist-builder`, memperbarui `lib/nav-config.ts`,
> `app/admin/page.tsx`, dan `PLAN/APP_FLOW.md`, serta menghapus header
> ganda di builder (layout baru sudah menyediakannya).

### 6.1 Struktur baru — \[RENCANA\]

```
app/admin/checklist/
  layout.tsx           (baru)  shell + judul + tab
  page.tsx             (baru)  riwayat eksekusi checklist
  builder/page.tsx     (pindah dari app/admin/checklist-builder/page.tsx)
```

`app/admin/checklist-builder/page.tsx` → redirect ke `/admin/checklist/builder`.

### 6.2 Tab "Riwayat" — [SAH], opsi A dipilih

Riwayat eksekusi checklist = daftar laporan shift, dibaca dari
`GET /api/admin/reports` dengan filter cabang. Opsi A (rekomendasi) dipilih:

| Halaman | Tujuan |
|---|---|
| `/admin/checklist` → tab **Riwayat** | Melihat **hasil** eksekusi checklist (read-mostly, seperti petugas). |
| `/admin/laporan` | **Mendistribusikan** laporan: share link publik, export CSV, WhatsApp. |

Keduanya menampilkan daftar laporan yang sama, jadi tumpang tindih visualnya
jujur. Pembedanya adalah **tujuan**: satu untuk membaca hasil, satu untuk
membagikan hasil. Alternatif B (gabung tiga tab di `/admin/laporan`) dan C
(sembunyikan `/admin/laporan` dari nav) tidak dipilih — B menumpuk halaman
distribusi dengan builder, C menyimpan URL yang masih dipakai pengguna.


### 6.3 Tab "Builder" — \[RENCANA\]

- Pindahkan `app/admin/checklist-builder/page.tsx` → `app/admin/checklist/builder/page.tsx`
- Hapus wrapper halaman luar (h1 + padding); layout baru yang menanganinya
- `lib/reducers/checklist-builder-reducer.ts`, hooks draft, dan
`components/admin/confirm-delete-dialog.tsx` tetap dipakai tanpa perubahan

### 6.4 Batas diff — \[RENCANA\]

`app/admin/checklist-builder/page.tsx` sekarang ±870 baris. Saat dipindah,
**jangan** melakukan refactor tambahan pada commit yang sama — cukup `git mv` +
penyesuaian wrapper, pastikan build lulus. Refactor menyusul sebagai PR terpisah.

---

## 7. Phase 5 — Restrukturisasi Navigasi

> **STATUS: SELESAI (2026-10-16).** `lib/nav-config.ts` ditulis ulang,
> ikon dobel diperbaiki, dan struktur dikunci oleh
> `tests/nav-config.test.ts` (12 test).

### 7.1 Prinsip — [SAH], diterapkan

Karena builder kini menjadi tab di dalam halaman, **entri nav terpisah untuk
builder dihapus**. Itu justru tujuan penyatuan. Test khusus
("tidak ada entri nav terpisah untuk builder") mengunci ini.

### 7.2 Nav admin (superuser) — [SAH]


| Grup                               | Item                                      |
| ---------------------------------- | ----------------------------------------- |
| **Harian** (parity dengan petugas) | Shift Saya, Incident, Checklist, Handover |
| **Operasional**                    | Dashboard, Operasi Shift, Laporan         |
| **Konfigurasi**                    | Cabang, Shift                             |
| **Administrasi**                   | Akun, Pengaturan, Audit Log               |
| **Bantuan**                        | Panduan, Ganti PIN                        |


`MOBILE_CORE_LIMIT = 4` membuat 4 item pertama (Shift Saya, Incident,
Checklist / SOP, Handover) masuk bottom bar, sisanya ke drawer "Lainnya"
(total 5 tombol).

**Keputusan:** "Incident" admin menunjuk ke `/admin/incident` (halaman
terpadu ber-Kategori), **bukan** `/incident` (halaman petugas). Alasannya:
menunjuk ke `/incident` akan membuat admin kehilangan akses cepat ke tab
Kategori dari nav, dan menambah dua entri terpisah justru membatalkan tujuan
penyatuan. `/incident` tetap ada untuk petugas.

### 7.3 Alias — [SAH]

```ts
{ name: 'Incident',       href: '/admin/incident',   aliases: ['/admin/incident/kategori'] }
{ name: 'Checklist / SOP', href: '/admin/checklist',  aliases: ['/admin/checklist/builder'] }
{ name: 'Handover',       href: '/admin/handover',   aliases: ['/admin/handover/builder'] }
{ name: 'Shift Saya',     href: '/daftar-shift',     aliases: ['/shift'] }
```

### 7.4 Perbaikan ikon — [SAH]

Dua keputusan:

| Tabrakan | Perbaikan |
|---|---|
| `Handover` & `Laporan` sama-sama `FileText` | `Handover` → `ArrowLeftRight` (transfer = serah terima), `Laporan` tetap `FileText`. Diperbaiki di admin **dan** petugas. |
| `Operasi Shift` & `Audit Log` sama-sama `Activity` | `Audit Log` → `History`. |
| `Pengaturan` & `Ganti PIN` sama-sama `Settings` | `Ganti PIN` → `KeyRound`. |

`ArrowLeftRight`, `History`, `KeyRound`, dan `CalendarClock` (untuk "Shift
Saya") sudah diverifikasi tersedia di `lucide-react@1.52.0`.

**Catatan:** dua tabrakan terakhir tidak ada di plan awal — saya temukan
ketika menyusun nav. Keduanya kelas masalah yang sama (ikon dobel), jadi
diperbaiki sekaligus. Tanpa itu, test "tidak ada ikon dobel" tidak akan
lulus.

### 7.5 Nav petugas — [SAH]

Daftar item **tidak berubah**: Checklist, Handover, Incident, Laporan +
Bantuan. Yang berubah hanya ikon (`Handover` → `ArrowLeftRight`,
`Ganti PIN` → `KeyRound`) supaya konsisten dengan admin.

---

## 8. Test &amp; Validasi

### 8.1 Yang sudah ada dan harus tetap lulus — \[SAH\]

```
npm run test   →  126 test, semuanya harus tetap hijau
```

Termasuk `handover-prev.test.ts` yang memuat
*"admin boleh membaca handover cabang mana pun"* —正是 gi rumusan "Baca ≠ Tulis".

### 8.2 Test baru — \[RENCANA\]

Phase 1 (§3.5) adalah yang paling penting karena menutup dua bug laten.

> **Catatan cakupan:** `PLAN/AGENTS.md` §7 menyatakan belum ada uji komponen
> React maupun uji halaman. Verifikasi UI (dropdown cabang, tab, submit form)
> **tetap dilakukan manual di perangkat** dan belum bisa dibuktikan oleh test suite.

### 8.3 Perintah verifikasi — \[SAH\]

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint
npm run test         # tsx --test
npm run build        # next build --webpack
```

### 8.4 Verifikasi manual wajib — \[BELUM DIUJI\]

```
[ ] Admin → /daftar-shift → buka shift sendiri → isi checklist → tutup shift
[ ] Admin → /incident/baru → incident tercatat pada cabang yang dipilih (cek sheet)
[ ] Admin tanpa cabang kerja → dapat 400 dengan pesan jelas, BUKAN data di cabang salah
[ ] Admin → /admin/operasi-shift → "Buka Atas Nama" untuk shift dari cabang kedua+
    (reproduksi Bug #1.5 — harus berhasil, sebelumnya gagal)
[ ] Admin → /admin/incident → tab Kategori masih berfungsi
[ ] Admin → /admin/checklist → tab Builder masih berfungsi
[ ] Nav mobile: 4 item + "Lainnya", semua halaman admin bisa diakses
[ ] Petugas: tidak melihat dropdown "Cabang kerja", tidak bisa buka halaman admin
```

---

## 9. Perkiraan


| Phase | Isi                                         | Estimasi     |
| ----- | ------------------------------------------- | ------------ |
| 1     | Konteks cabang kerja + penguatan API + test | 1.5–2 hari   |
| 2     | Penyatuan peran + audit role check          | 0.5 hari     |
| 3     | Penyatuan halaman Incident                  | 0.5 hari     |
| 4     | Penyatuan halaman Checklist                 | 1 hari       |
| 5     | Restrukturisasi nav                         | 0.5 hari     |
| 6     | Test regresi + verifikasi manual            | 1 hari       |
|       | **Total**                                   | **5–6 hari** |


---

## 10. Risiko &amp; Mitigasi


| Risiko                                                     | Mitigasi                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Admin tanpa cabang kerja menulis ke cabang yang salah      | API `400`, tidak ada fallback. Working branch wajib dipilih sebelum form bisa disubmit.                         |
| `branchIds[0]` tersisa di jalur tulis lain                 | Grep ulang `branchIds[0]` setelah Phase 1; hanya boleh tersisa di jalur baca atau fallback petugas satu-cabang. |
| Test lama mengira admin = akses penuh tanpa cabang         | Yang ditambahkan hanya gate **tulis**. Gate baca tidak berubah.                                                 |
| Select "Cabang" di form incident yang selama ini dekoratif | Diperbaiki di §3.4 — kirim `branchId` di body.                                                                  |
| Nav 12 item padat di mobile                                | Bottom bar capped 4; sisanya drawer "Lainnya".                                                                  |
| Diff Phase 4 terlalu besar (870 baris dipindah + diubah)   | Pindahkan dulu tanpa modifikasi lain; refactor menyusul.                                                        |
| Admin tersesat di `/admin/handover`                        | Halaman itu adalah riwayat + builder, jadi                                                                      |


---

## 11. Kontradiksi dengan Dokumen yang Ada

`PLAN/AGENTS.md` perlu diperbarui setelah implementasi:


| Lokasi             | Klaim lama                                                                   | Setelah perubahan                                                                      |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AGENTS.md` §2     | "Dua peran akun: Petugas dan Admin."                                         | Tetap dua role; hubungan berubah menjadi superuser.                                    |
| `AGENTS.md` §6     | "`/` ... mengarahkan admin ke `/admin`, dan petugas ke `/daftar-shift`"      | Tetap sama untuk arah; tapi admin kini juga bisa memakai `/daftar-shift`.              |
| `AGENTS.md` §4     | "Proteksi role/cabang diterapkan oleh handler yang memanggil helper terkait" | Tetap; tambahkan catatan bahwa admin kini wajib memilih cabang kerja untuk aksi tulis. |
| `PLAN/APP_FLOW.md` | Daftar route `/admin/kategori-incident`, `/admin/checklist-builder`          | menjadi sub-halaman tab.                                                               |


Tidak ada pertentangan dengan PRODUK: jumlah role tetap 2, dan "PJ adalah status
shift, bukan peran akun" tetap berlaku.

---

## 12. Di Luar Scope

- Notifikasi bell di header (sudah diinventaris, dibahas terpisah)
- Multi-level role (supervisor, manajer area) — model tetap 2 role
- Audit log untuk perubahan template builder
- Migrasi kolom `Users.Role` di registry
- Menghapus proteksi admin terakhir di `users/[id]/route.ts:74`

---

## 13. Keputusan yang Masih Menunggu

**Satu pertanyaan terbuka** sebelum Phase 4 dikerjakan (Phase 1–3 bisa jalan dulu):

> **Batas antara `/admin/checklist` tab Riwayat dan `/admin/laporan`**
> (opsi A/B/C di §6.2). Rekomendasi: **Opsi A**.

Ditambah satu konfirmasi kecil:

> **Mode maintenance** — apakah admin tetap boleh masuk saat maintenance aktif
> (§1.8)? Rekomendasi: **ya**, supaya admin tetap bisa.nonaktifkan.