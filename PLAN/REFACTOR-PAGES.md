# Rencana Refaktor Halaman dan Navigasi (REFAKTOR-PAGES)

> **Status dokumen:** RENCANA. Belum ada implementasi.
> Lokasi yang disarankan: `PLAN/REFAKTOR-PAGES.md`.
>
> Dokumen ini menggantikan rencana halaman yang sebelumnya hanya ada dalam percakapan,
> dan menjadi acuan untuk navigasi serta halaman admin dan petugas. Untuk model role dan
> kapabilitas, lihat `SUPERUSER-ROLE-REFACTOR.md`. Untuk perilaku produk, lihat `PRD.md`.
>
> Legenda status:
>
> - **\[SAH\]**: terverifikasi di source code saat dokumen ditulis
> - **\[SAH-DOK\]**: diambil dari dokumen lain, belum diverifikasi ulang
> - **\[KEPUTUSAN\]**: asumsi yang harus dikonfirmasi sebelum dikerjakan
> - **\[RENCANA\]**: yang hendak dikerjakan
> - **\[BELUM DIUJI\]**: belum dijalankan, jangan dianggap lulus

---

## 0. Ringkasan

Model yang dipakai: **admin = petugas + privilege**. Admin melihat dan bisa mengerjakan
semua fitur petugas, lalu mendapat tambahan fitur admin di satu tempat yang jelas.

Yang diubah:

1. Menghapus jalur ganti PIN sepenuhnya (menu, API, dan flag `Must_Change_Pin`).
2. Menyusun ulang navigasi admin agar mengikuti model superuser: blok petugas yang sama,
   lalu satu hub "Admin" untuk fitur privilege.
3. Menyatukan komponen daftar Incident dan Laporan agar admin dan petugas memakai satu
   komponen dengan prop `role`.
4. Menegaskan bahwa halaman petugas bisa dibuka admin, dan menghapus sisa redirect yang
   tidak sesuai model.
5. Menampilkan cabang kerja di halaman aksi admin.
6. Menyelaraskan label dan dokumen yang menyebut kondisi lama.

Yang tidak diubah: route URL, model data, dan otorisasi API.

---

## 1. Keputusan yang Diasumsikan \[KEPUTUSAN\]

Keputusan di bawah diambil sebagai asumsi kerja. Setiap nomor bisa diganti sebelum Fase 1
dimulai. Bagian lain dokumen ini mengacu ke nomor ini.

| # | Keputusan (asumsi) | Alasan | Alternatif |
| --- | --- | --- | --- |
| D1 | Bar bawah admin: **Checklist, Handover, Incident, Laporan, Admin**. Slot kelima berisi hub "Admin" (Dashboard, Operasi Shift, Konfigurasi, Administrasi). | Sejalan dengan model superuser: admin melihat menu petugas yang sama. | PRDS5.2 (Dashboard, Operasi, Incident, Laporan, Lainnya), atau hybrid dengan Dashboard di slot pertama. |
| D2 | Admin mendarat di `/admin` setelah login. | Dashboard adalah pusat pengawasan. Redirect ini memang disengaja di `app/page.tsx:11`. | Mendarat di `/daftar-shift`. |
| D3 | Tombol berbagi laporan **hanya untuk admin**. | Sesuai PRD (ADM-RP-03 dibahas di konteks admin) dan konsisten dengan pembatasan tindakan admin lain. | Semua petugas boleh berbagi. |
| D4 | Fitur ganti PIN dihapus. PIN hanya diubah admin lewat reset. | Keputusan pemilik produk. | - |
| D5 | Admin tetap bisa masuk saat maintenance (status quo). | Pertanyaan terbuka di SUPERUSERS1.8. | Admin ikut terkunci saat maintenance. |
| D6 | Statistik lengkap dan ekspor PDF **di luar fase ini**. | Membutuhkan cakupan metrik tersendiri. Dicatat sebagai backlog. | Masuk Fase 6. |
| D7 | Admin yang tidak bisa mengganti PIN sendiri diatasi dengan **minimal dua akun admin**. | Tanpa jalur ganti PIN, admin tunggal tidak bisa mengganti PIN sendiri. | Jalur self-service khusus admin. |

---

## 2. Kondisi Saat Ini

### 2.1 Navigasi \[SAH\]

`lib/nav-config.ts`:

- Admin, grup pertama "Harian": Shift Saya (`/daftar-shift`), Incident (`/admin/incident`),
  Checklist / SOP (`/admin/checklist`), Handover (`/admin/handover`).
- Admin, grup "Operasional": Dashboard, Operasi Shift, Laporan.
- Admin, grup "Konfigurasi": Cabang, Shift. Admin, grup "Administrasi": Akun, Pengaturan,
  Audit Log. Keduanya di grup "Bantuan": Panduan dan Ganti PIN.
- Petugas, grup "Utama": Checklist (`/daftar-shift`), Handover (`/handover`), Incident
  (`/incident`), Laporan (`/report`). Grup "Bantuan": Panduan dan Ganti PIN.
- `MOBILE_CORE_LIMIT = 4`, sehingga 4 item pertama grup pertama masuk bar bawah.

### 2.2 Halaman yang menolak atau membatasi admin \[SAH\]

| Route | Perilaku saat ini |
| --- | --- |
| `app/page.tsx:11` | Admin diarahkan ke `/admin`. Ini disengaja (lihat D2). |
| `app/daftar-shift/page.tsx` | Hanya memeriksa sesi (`!ctx` → login). **Tidak** mengarahkan admin. |
| `app/handover/page.tsx:26` | Hanya memeriksa sesi. **Tidak** mengarahkan admin. |
| `app/incident/page.tsx`, `app/report/page.tsx`, `app/incident/baru/page.tsx`, `app/shift/[id]/page.tsx` | Memakai `requireUser`, tidak membatasi admin. |

Catatan: `SUPERUSER-ROLE-REFACTOR.md`S1.2 danS4.1 masih menyebut `/daftar-shift` dan
`/handover` mengarahkan admin. Itu sudah tidak benar. **Blokir redirect untuk dua halaman
tersebut sudah hilang.** Fase 2 di bawah hanya memverifikasi dan menutup dokumen.

### 2.3 Tombol dan endpoint berbagi laporan \[SAH\]

- `components/report/share-report-button.tsx` memanggil `POST /api/admin/reports/[id]/share`.
- Route `app/api/admin/reports/[id]/share/route.ts` memakai `withAuth` tanpa `requiredRole`.
  Artinya route ini bisa dipanggil oleh **petugas**, bukan hanya admin.
- Tombol berbagi juga ada di daftar laporan petugas (`components/report/report-list.tsx`).

Ini celah otorisasi terhadap keputusan D3. Harus ditutup di Fase 0.

### 2.4 Halaman admin yang berisi fitur khusus \[SAH\]

**`/admin/incident`** (595 baris): filter cabang (`branchFilter`), filter kategori dan
status, lepas tautan shift untuk incident berdiri sendiri (ikon `Link2Off`), tambah catatan
(`MessageSquarePlus`), dan pencarian.

**`/admin/laporan`** (422 baris): filter laporan, buat dan cabut tautan berbagi, ekspor CSV,
paginasi.

Keduanya memiliki komponen daftar sendiri, terpisah dari `components/incident/incident-list`
dan `components/report/report-list`.

### 2.5 Ganti PIN \[SAH\]

- Menu "Ganti PIN" masih ada di `lib/nav-config.ts` (dua tempat), dan tidak ada halaman
  `app/ganti-pin`.
- Endpoint `app/api/auth/change-pin/route.ts` masih ada.
- Flag `Must_Change_Pin` ditulis `true` di `app/api/admin/users/route.ts:98`, dibaca di
  `app/api/auth/login/route.ts:66-67`, dan dikirim ke klien. Tidak ada UI yang memakainya
  untuk memaksa perubahan.

### 2.6 Cabang kerja admin \[SAH-DOK\]

Provider `WorkingBranchProvider` dan selector cabang sudah ada, dan dibaca dari cookie
(`APP_FLOW.md`S2). Selector hanya tampil di sidebar desktop dan drawer mobile. Halaman aksi
belum menampilkan cabang yang sedang dipakai.

### 2.7 Bug cabang pada incident \[SAH-DOK\]

Menurut `SUPERUSER-ROLE-REFACTOR.md`S1.4, pembuatan incident oleh admin tanpa cabang
eksplisit jatuh ke `ctx.branchIds[0]`, sementara form tidak mengirim `branchId`. Ini harus
diperbaiki di Fase 1, sebelum admin sering membuat incident.

---

## 3. Target

### 3.1 Navigasi

**Admin, bar bawah (mobile):**

| Slot | Menu | Tujuan |
| --- | --- | --- |
| 1 | Checklist | `/daftar-shift` |
| 2 | Handover | `/admin/handover` |
| 3 | Incident | `/admin/incident` |
| 4 | Laporan | `/admin/laporan` |
| 5 | Admin | Membuka drawer hub |

**Admin, drawer hub "Admin":**

- Operasional: Dashboard (`/admin`), Operasi Shift (`/admin/operasi-shift`)
- Konfigurasi: Cabang (`/admin/cabang`), Shift (`/admin/shift`), SOP Checklist (`/admin/checklist`)
- Administrasi: Akun (`/admin/akun`), Pengaturan (`/admin/pengaturan`), Audit Log (`/admin/audit-log`)
- Bantuan: Panduan (`/docs`)

**Admin, sidebar (desktop):** grup Utama berisi keempat item bar bawah, lalu grup Admin,
Konfigurasi, Administrasi, dan Bantuan dengan isi yang sama seperti drawer.

**Petugas, bar bawah:** Checklist, Handover (`/handover`), Incident (`/incident`), Laporan
(`/report`), Lainnya (drawer berisi Panduan).

**Petugas, sidebar:** grup Utama (4 item) dan Bantuan (Panduan).

Alias dipertahankan agar item tetap aktif di sub-halaman:

- Checklist: alias `/shift`
- Handover: alias `/handover` (untuk admin) dan `/admin/handover/builder`
- Incident: alias `/admin/incident/kategori`
- SOP Checklist: alias `/admin/checklist/builder`

### 3.2 Akses halaman

- Admin dapat membuka semua halaman petugas. Tidak ada redirect paksa di halaman petugas.
- Admin dan petugas memakai komponen yang sama untuk daftar Incident dan Laporan. Yang
  berbeda hanya kontrol tambahan admin.
- Route `/` tetap mengarahkan admin ke `/admin` dan petugas ke `/daftar-shift`.

### 3.3 Halaman

| Route | Peran | Isi |
| --- | --- | --- |
| `/daftar-shift` | Admin dan petugas | Sama. Admin melihat cabang kerja di header. |
| `/handover` | Petugas | Riwayat handover (komponen bersama). |
| `/admin/handover` | Admin | Tab Riwayat dan Builder (sudah ada). |
| `/incident` | Petugas | `IncidentList` tanpa kontrol admin. |
| `/admin/incident` | Admin | Shell dengan tab Daftar dan Kategori. Daftar memakai `IncidentList` dengan `role="admin"`. |
| `/incident/baru`, `/incident/[id]` | Admin dan petugas | Sama. Admin melihat cabang kerja di header. |
| `/report` | Petugas | `ReportList` dengan `role="petugas"`. |
| `/admin/laporan` | Admin | `ReportList` dengan `role="admin"`. |
| `/report/[id]` | Admin dan petugas | Sama. Tindakan admin (addendum, buka kunci, void) tampil hanya untuk admin. |
| `/admin/checklist` | Admin | Tab Riwayat dan Builder (sudah ada). |
| `/admin/operasi-shift` | Admin | Sama, dengan cabang kerja di header. |
| `/admin/cabang`, `/admin/shift`, `/admin/akun`, `/admin/pengaturan`, `/admin/audit-log` | Admin | Tidak berubah. |
| `/ganti-pin` | - | **Dihapus.** |

---

## 4. Fase Pengerjaan

Urutan: Fase 0 dan 1 dulu. Fase 3 dan 4 setelah Fase 1. Fase 2 bisa dikerjakan kapan saja.
Fase 7 terakhir.

### Fase 0 — Tutup celah keamanan dan bersihkan Ganti PIN

**Tujuan:** tidak ada jalur ganti PIN sendiri, dan tindakan berbagi laporan sesuai D3.

| Berkas | Perubahan |
| --- | --- |
| `app/api/auth/change-pin/route.ts` | Hapus. |
| `lib/nav-config.ts` | Hapus entri "Ganti PIN" dari grup Bantuan (admin dan petugas). |
| `app/api/admin/users/route.ts:98` | Hentikan penulisan `Must_Change_Pin = true`. Kolom di sheet tetap ada. |
| `app/api/auth/login/route.ts:66-77` | Hapus field `mustChangePin` dari respons. |
| `lib/AuthContext.tsx`, `lib/api-auth.ts`, `lib/page-auth.ts` | Hapus field `mustChangePin` dari tipe dan nilai default. |
| `app/api/admin/reports/[id]/share/route.ts` | Sesuai D3: tambahkan `requiredRole: 'admin'` pada route create, revoke, dan list. |
| `components/report/report-list.tsx` | Sembunyikan tombol berbagi untuk petugas. |
| `PLAN/UI-UX.md`, `PLAN/APP_FLOW.md` | Hapus baris `/ganti-pin` dan rujukan `mustChangePin`. |
| `PLAN/SUPERUSER-ROLE-REFACTOR.md`S1.2,S4.1 | Koreksi: redirect `/daftar-shift` dan `/handover` sudah dihapus. |

**Pra-syarat D7:** pastikan minimal dua akun admin aktif sebelum Fase 0 dijalankan di produksi.

**Penerimaan:**
- Tidak ada menu atau tautan ke `/ganti-pin`.
- `POST /api/auth/change-pin` mengembalikan 404.
- Petugas yang memanggil route share mendapat 403.
- Petugas tidak melihat tombol berbagi.

### Fase 1 — Navigasi, cabang kerja, dan bug cabang incident

**Tujuan:** navigasi admin mengikuti D1, dan admin selalu tahu cabang tempat ia bekerja.

| Berkas | Perubahan |
| --- | --- |
| `lib/nav-config.ts` | Susun ulang `ADMIN_NAV`: grup Utama (Checklist, Handover, Incident, Laporan), grup Admin (Dashboard, Operasi Shift), Konfigurasi (Cabang, Shift, SOP Checklist), Administrasi, Bantuan. Label "Checklist" untuk `/daftar-shift` di kedua peran. Label "SOP Checklist" untuk `/admin/checklist`. |
| `lib/nav-config.ts` (`getMobileMoreGroups`) | Tidak perlu diubah logikanya. Grup kedua dan seterusnya otomatis masuk drawer. Ubah nama grup kedua menjadi "Admin". |
| `components/NavbarClient.tsx` | Untuk admin, item bar bawah kelima adalah tombol "Admin" yang membuka drawer. Untuk petugas tetap "Lainnya". |
| `components/shared/working-branch-chip.tsx` (baru) | Chip "Cabang: {nama}" memakai `useWorkingBranch()`. Hanya tampil untuk admin. |
| `app/incident/baru/page.tsx`, `app/shift/[id]/page.tsx`, `app/daftar-shift/page.tsx`, `app/admin/operasi-shift/page.tsx` | Pasang chip di header. |
| `components/incident/incident-create-form.tsx` | Kirim `branchId` dari cabang kerja (atau pilihan cabang untuk admin). |
| `app/api/incidents/route.ts` (POST) | Untuk admin, `branchId` wajib dan harus termasuk cabang yang valid. Hapus fallback `ctx.branchIds[0]`. |
| `tests/nav-config.test.ts` | Perbarui 12 test sesuai struktur baru. Tambahkan test: tidak ada entri "Ganti PIN"; tidak ada dua entri yang menunjuk halaman sama; setiap href punya `page.tsx`. |

**Penerimaan:**
- Admin di HP melihat Checklist, Handover, Incident, Laporan, dan tombol Admin.
- Tombol Admin membuka drawer yang berisi Dashboard, Operasi Shift, Konfigurasi, Administrasi.
- Chip cabang tampil di halaman aksi dan berubah saat cabang kerja diganti.
- Incident yang dibuat admin tanpa cabang eksplisit ditolak dengan 400.
- Tidak ada item navigasi yang menunjuk ke route yang tidak ada.

### Fase 2 — Verifikasi akses halaman petugas untuk admin

**Tujuan:** memastikan admin bisa membuka halaman petugas, dan menutup dokumen yang sudah tidak akurat.

| Berkas | Perubahan |
| --- | --- |
| `app/page.tsx` | Tidak diubah (redirect admin ke `/admin` disengaja). |
| `app/daftar-shift/page.tsx`, `app/handover/page.tsx` | Tidak diubah. Hanya verifikasi. |
| `SUPERUSER-ROLE-REFACTOR.md`S1.2,S4.1 | Tandai selesai dengan catatan tanggal dan rujukan ke Fase 2. |

**Penerimaan:**
- Admin dapat membuka `/daftar-shift`, `/handover`, `/incident`, `/report`, `/incident/baru`,
  dan `/shift/[id]`.
- Sesi tanpa login tetap diarahkan ke `/login`.

### Fase 3 — Penyatuan daftar Incident

**Tujuan:** satu komponen daftar untuk admin dan petugas.

| Berkas | Perubahan |
| --- | --- |
| `components/incident/incident-list.tsx` | Terima prop `role: 'admin' \| 'petugas'`. Pindahkan logika dan tampilan dari `app/admin/incident/page.tsx` yang dipakai bersama (kartu, pencarian, filter status dan kategori). |
| `components/incident/incident-list.tsx` | Tampilkan filter cabang, aksi lepas tautan, dan catatan admin hanya jika `role === 'admin'`. |
| `app/admin/incident/page.tsx` | Menjadi shell: header, tab Daftar dan Kategori, lalu render `<IncidentList role="admin" />`. |
| `app/incident/page.tsx` | Render `<IncidentList role="petugas" />`. |
| `components/admin/incident-section-tabs.tsx` | Tidak berubah. |

**Pemeriksaan regresi:**
- Tampilan petugas harus identik dengan sebelum refaktor (ambil tangkapan layar sebelum dan sesudah).
- Filter, pencarian, dan navigasi ke `/incident/[id]` tetap berfungsi.

**Penerimaan:**
- `app/admin/incident/page.tsx` tidak lagi berisi logika daftar sendiri.
- Route `/admin/incident`, `/admin/incident/kategori`, dan `/admin/kategori-incident` (redirect) tetap berfungsi.

### Fase 4 — Penyatuan daftar Laporan

**Tujuan:** satu komponen daftar untuk admin dan petugas.

| Berkas | Perubahan |
| --- | --- |
| `components/report/report-list.tsx` | Terima prop `role`. Pindahkan logika dari `app/admin/laporan/page.tsx`: filter cabang, tanggal, shift, PJ, dan status; paginasi. |
| `components/report/report-list.tsx` | Tampilkan tombol berbagi, cabut tautan, dan ekspor CSV hanya jika `role === 'admin'`. |
| `app/admin/laporan/page.tsx` | Menjadi shell dengan judul dan `<ReportList role="admin" />`. |
| `app/report/page.tsx` | Render `<ReportList role="petugas" />`. |
| `components/report/share-report-button.tsx` | Tidak berubah selain penyesuaian props. |

**Penerimaan:**
- Petugas tidak melihat tombol berbagi, cabut, atau ekspor.
- Admin melihat semua kontrol yang ada sekarang.
- Route `/report`, `/report/[id]`, `/admin/laporan` tetap berfungsi.

### Fase 5 — Checklist dan Handover sebagai hub admin

**Tujuan:** label dan tab konsisten dengan navigasi baru. Tidak ada perubahan perilaku.

| Berkas | Perubahan |
| --- | --- |
| `components/admin/checklist-section-tabs.tsx` | Tidak berubah. Pastikan judul halaman "SOP Checklist". |
| `app/admin/checklist/page.tsx` | Judul halaman "SOP Checklist". |
| `components/handover/handover-section-tabs.tsx` | Tidak berubah. |

**Penerimaan:**
- Admin dapat berpindah antara Riwayat dan Builder di kedua hub.
- Route lama `/admin/checklist/builder` dan `/admin/handover/builder` tetap berfungsi.

### Fase 6 — Dashboard dan Operasi Shift

**Tujuan:** tampilan admin yang lebih efisien.

| Berkas | Perubahan |
| --- | --- |
| `app/admin/page.tsx` | Kartu "Urutan persiapan operasional" bisa ditutup. Simpan preferensi per admin (localStorage atau kolom akun). Tampilkan kembali jika ada cabang tanpa `Spreadsheet_ID`. |
| `app/admin/page.tsx` | Daftar "Peringatan" (shift berjalan lama) menjadi tautan ke `/admin/operasi-shift`. |
| `app/admin/operasi-shift/page.tsx` | Pasang chip cabang kerja di header. |

**Catatan:** statistik lengkap (ADM-RP-04) dan ekspor PDF (ADM-RP-05) tidak termasuk, sesuai D6.

**Penerimaan:**
- Kartu panduan bisa ditutup dan tetap tertutup setelah reload.
- Tautan peringatan membuka halaman operasi.

### Fase 7 — Dokumen dan arsip

**Tujuan:** tidak ada dokumen yang menyebut kondisi lama sebagai aktif.

| Dokumen | Perubahan |
| --- | --- |
| `PLAN/PRD.md`S5.2 | Ubah navigasi admin sesuai D1. Tandai catatan kesesuaian. |
| `PLAN/APP_FLOW.md` | PerbaruiS2 danS4 (grup navigasi, hapus `/ganti-pin`, tandai builder sebagai tab). |
| `PLAN/UI-UX.md` | Perbaiki bar bawah petugas (ada Handover). Hapus `/ganti-pin`. |
| `PLAN/SUPERUSER-ROLE-REFACTOR.md` |S1.2,S4.1 dikoreksi.S7.2 diganti dengan rujukan ke dokumen ini.S13 diisi dengan keputusan D1–D7. |
| `PLAN/redesign-flow-admin.md` | Pindahkan ke `PLAN/archive/`. Tambahkan catatan bahwa rencana ini menggantikannya. |
| `PLAN/plan-performance.md`, `PLAN/REFACTOR.md` | Pindahkan ke `PLAN/archive/`. |
| `PLAN/PHOTO-EVIDANCE-DRIVE-V2.md` | Ganti nama menjadi `PHOTO-EVIDENCE-DRIVE-V2.md`. Hapus `PHOTO-EVIDENCE-DRIVE.md` (v1) atau pindahkan ke archive. |
| `PLAN/elevenlabs-DESIGN.md` | Pindahkan ke `PLAN/reference/`. |
| `PLAN/README.md` (baru) | Indeks dokumen dan otoritasnya. |

---

## 5. Pengujian

### 5.1 Otomatis \[BELUM DIUJI\]

| Berkas uji | Cakupan |
| --- | --- |
| `tests/nav-config.test.ts` (diperbarui) | Struktur grup admin dan petugas; bar bawah 4 item; drawer berisi grup sisanya; tidak ada "Ganti PIN" |
| `tests/nav-links.test.ts` (baru) | Setiap href di navigasi punya `page.tsx` atau rute dinamis yang valid |
| `tests/incident-create-branch.test.ts` (baru) | Admin tanpa `branchId` ditolak 400; petugas memakai cabang penugasan |
| `tests/report-share-role.test.ts` (baru) | Petugas mendapat 403 pada route share |
| `tests/change-pin-removed.test.ts` (baru) | Route `change-pin` tidak ada (404) |

Perintah: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Catatan: repo belum punya test komponen React. Komponen `IncidentList` dan `ReportList`
diverifikasi manual (lihat 5.2).

### 5.2 Manual \[BELUM DIUJI\]

**Desktop:**
- [ ] Admin: sidebar menampilkan grup Utama, Admin, Konfigurasi, Administrasi, Bantuan
- [ ] Petugas: sidebar menampilkan grup Utama dan Bantuan saja
- [ ] Chip cabang tampil dan berubah di halaman aksi admin

**HP (lebar 320px dan 375px):**
- [ ] Admin: bar bawah 5 tombol, drawer hub Admin terbuka dan tertutup dengan benar
- [ ] Petugas: bar bawah 5 tombol (4 + Lainnya)
- [ ] Drawer tidak menutupi tombol aksi utama

**Regresi tampilan petugas:**
- [ ] `/incident` identik dengan sebelum Fase 3 (tangkapan layar)
- [ ] `/report` identik dengan sebelum Fase 4 (tangkapan layar)

**Akses:**
- [ ] Admin membuka `/daftar-shift`, `/handover`, `/shift/[id]` tanpa redirect
- [ ] Petugas tidak melihat tombol berbagi
- [ ] Petugas yang membuka URL route share secara langsung tidak bisa membuat tautan

---

## 6. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Regresi tampilan petugas setelah penyatuan | Petugas kebingungan | Tangkapan layar sebelum dan sesudah; pemeriksaan manual sebelum rilis |
| Admin tidak bisa mengganti PIN sendiri | Admin terkunci jika hanya satu akun | D7: minimal dua akun admin sebelum Fase 0 |
| Kolom `Must_Change_Pin` tetap ada di sheet | Membingungkan | Hentikan penulisan; tandai di dokumen skema sebagai tidak dipakai |
| Admin terbiasa dengan bar bawah lama | Perlu adaptasi | Panduan singkat di `/docs`; perubahan diumumkan |
| Route share tertutup untuk petugas | Petugas yang biasa berbagi tidak bisa | Keputusan D3 harus dikonfirmasi sebelum Fase 0 |
| Bug cabang incident belum diperbaiki sebelum admin sering membuat incident | Incident masuk cabang yang salah | Fase 1 mendahului penggunaan rutin |
| Sheet dan operasi tidak atomik | Perubahan Registry dan cabang bisa setengah jadi | Tidak diubah di fase ini; lihat dokumen performa dan skema |

---

## 7. Di Luar Scope

- Statistik lengkap ADM-RP-04 dan ekspor PDF ADM-RP-05 (D6)
- Mode Pratinjau sebagai petugas (PRD ADM-CK-03), kecuali dikonfirmasi sebagai fitur tersendiri
- Admin sebagai PJ shift (membutuhkan perubahan model data; lihat `SUPERUSER-ROLE-REFACTOR.md`S4.3)
- Perubahan skema data dan kolom baru (`acting_role`, `action_class`, `USER_BRANCH_ACCESS`)
- Hashing PIN dan audit log (dokumen terpisah)
- Resolver shift lintas cabang (dokumen terpisah)
- Notifikasi dan preferensi notifikasi

---

## 8. Checklist Penyelesaian

- [ ] D1–D7 dikonfirmasi
- [ ] Fase 0 selesai dan diuji
- [ ] Fase 1 selesai dan diuji
- [ ] Fase 2 selesai, dokumen superuser dikoreksi
- [ ] Fase 3 selesai, tangkapan layar regresi petugas sama
- [ ] Fase 4 selesai, tangkapan layar regresi petugas sama
- [ ] Fase 5 selesai
- [ ] Fase 6 selesai
- [ ] Fase 7 selesai, `PLAN/README.md` dibuat
- [ ] Pengujian otomatis lulus
- [ ] Pengujian manual selesai

