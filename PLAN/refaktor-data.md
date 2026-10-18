```markdown
# Rencana Refaktor Data MyCheck: Template, Registry, Kode, dan Sheet Cabang

> Status: IMPLEMENTASI BERTAHAP (mode flat untuk template baru; legacy tetap dibaca)
> Pendekatan: Tetap di Google Sheets (opsi A), dirapikan.
> Dasar: analisis commit b93bd2a (16 Oktober 2026) dan tiga file export
> (Template_cabang_mycheck.xlsx, CBGBDG01_-_Bandung.xlsx, Copy_of_RESGISTRY_MYCHECK.xlsx).
>
> Legenda:
> - [SAH] terverifikasi di kode atau file export
> - [PERLU KONFIRMASI] belum diverifikasi, atau menunggu keputusan
> - [RENCANA] yang akan dikerjakan

## 0.3 Catatan implementasi 2026-10-18

- [SELESAI] Bug pencarian incident tidak lagi membatasi fallback ke tiga bulan; resolver membaca seluruh periode yang tersedia dari metadata spreadsheet.
- [SELESAI] Helper periode terpusat berada di `lib/schema/periods.ts`; perhitungan periode baru memakai zona waktu cabang/default `Asia/Jakarta`.
- [SELESAI] Registry skema, normalisasi tipe/enum, pembacaan `schema_version`/`period_mode`, dan dual-read yearly + monthly legacy tersedia di `lib/schema/` dan `lib/store.ts`.
- [SELESAI] Audit memakai sheet periode aktif; mode `flat` memakai satu chain generik, legacy yearly tetap menghasilkan chain per tahun.
- [SELESAI] Migrator API idempotent tersedia melalui `npm run migrate:data-yearly`; default dry-run, `--apply` membuat backup Drive dan tidak menghapus sheet lama.
- [TERUJI] Dry-run live `CBGBDG01` membaca 43 incident, 15 handover, 3 catatan, dan 1 foto pada data sumber. Percobaan apply belum mendapat respons verifikasi dari API dan karena itu tidak dianggap berhasil.
- [TERUJI] Checker live `CBGBDG01` menemukan 120 temuan: `ShiftInstances` kosong sementara data periodik memiliki referensi shift, 14 baris `is_test`, dan actor berbentuk ID/`U-PJ-001` yang belum dapat dipetakan ke `Username`. Migrator kini fail-closed pada kondisi export tidak lengkap.
- [SELESAI] Verifier audit chain tersedia untuk chain bulanan legacy dan chain tahunan dengan anchor antar-tahun; endpoint cron `/api/cron/verify` mengembalikan status per cabang.
- [SELESAI] Preflight cleanup Fase 7 tersedia melalui `npm run cleanup:phase7`; default dry-run, dan `--apply` fail-closed sampai semua cabang flat/yearly serta konfirmasi eksplisit tersedia.
- [SELESAI] Fase 8 mendokumentasikan schema kanonik di `PLAN/DATABASE_SCHEMA.md`, ERD turunan, dan instruksi arsitektur.
- [SELESAI] Mode target cabang baru ditetapkan `flat`: sheet transaksi generik, arsip tahunan manual ke spreadsheet terpisah; mode monthly/yearly tetap kompatibilitas.
- [SELESAI] Arsip manual admin tersedia di halaman `/admin/pengaturan`: pratinjau per cabang/tahun, konfirmasi, pembuatan spreadsheet arsip, dan pencatatan ID arsip ke Registry.
- [TERTUNDA] Migrasi live, penghapusan/rename sheet legacy, hashing PIN, dan keputusan P4–P10 memerlukan verifikasi operasional dan pilihan eksplisit. Eksekusi arsip tetap dilakukan manual oleh admin setelah pratinjau.

---

## 0. Tujuan dan Batasan

### 0.1 Tujuan
1. Skema data konsisten: tipe, enum, dan identitas aktor seragam di semua cabang.
2. Satu sumber kebenaran untuk nama sheet, header, tipe, dan periode di kode.
3. Struktur template dan registry sederhana, tanpa sheet mati.
4. Data bulanan diganti dengan data tahunan, dengan arsip untuk tahun lama.
5. Migrasi bisa diulang, bisa dibatalkan, dan bisa diverifikasi.
6. Dua bug yang sudah ada (pencarian incident hanya 3 bulan, dan zona waktu UTC) diperbaiki lebih dulu.

### 0.2 Di luar lingkup
- Migrasi ke database relasional (dibahas sebagai kriteria keluar, bukan dikerjakan di sini).
- Penyimpanan foto via Google Apps Script (dokumen PHOTO-EVIDENCE-DRIVE-V2).
- Refaktor halaman dan navigasi (dokumen REFAKTOR-PAGES).
- Hashing PIN. Ini dibahas sebagai prasyarat keamanan di bagian 9, tetapi dikerjakan dalam rencana terpisah.

### 0.3 Prinsip
- Sheets tidak pernah diubah langsung. Semua perubahan lewat kode atau skrip migrasi.
- Setiap fase punya rollback.
- Tidak ada fase yang mengubah dua hal sekaligus (misalnya skema dan periode).

---

## 1. Kondisi Saat Ini (ringkasan verifikasi)

### 1.1 Template cabang [SAH]
- 22 sheet: `_meta`, 4 konfigurasi, 2 shift, 2 sheet tidak dipakai (`Summary`, `Snapshots`), `IncidentIndex`, dan 8 sheet bulanan dengan suffix `_2026-10`.
- `_meta.schema_version` kosong di template. Di cabang nyata berisi `1`.
- Tidak ada pembaca `schema_version` di kode (0 referensi).

### 1.2 Registry [SAH]
- `Daftar_Cabang` punya kolom `Folder_Drive_ID` dan kolom baru `Branch_Folder_ID`, `Evidence_Folder_ID`. Dua kolom baru sudah ada di file export.
- `Settings_Global` punya 8 key, semua nilainya kosong di export.
- `Users` memuat kolom `PIN` (teks biasa, 9 kolom termasuk `Must_Change_Pin`). Nilai PIN tidak dicetak di dokumen ini.
- `Template_Referensi`, `Share_Tokens` ada. `Daftar_Cabang` dan `Users` kosong di export.

### 1.3 Data cabang CBGBDG01 [SAH, dari export]
| Temuan | Angka | Catatan |
| --- | --- | --- |
| `Incidents` total | 43 | 4 (09), 28 (10), 11 (11) |
| Incident dengan `is_test = TRUE` | 14 | Tercampur dengan data nyata |
| Incident tanpa `category_id` | 25 | Semua dari `reported_by = U-PJ-001` |
| Incident terhubung shift tanpa `link_source` | 25 | Sama dengan di atas |
| Referensi `shift_instance_id` ke `ShiftInstances` | 39 | Sheet `ShiftInstances` kosong di export |
| `severity` berbahasa Inggris | 20 | `medium`, `high`, `low` |
| `severity` berbahasa Indonesia | 2 | `rendah` |
| `status` | `open` 18, `selesai` 25 | Dua bahasa |
| `reported_by` | `U-PJ-001` 25, `Taufik` 4, ULID lain | Tiga bentuk identitas |
| Boolean disimpan sebagai teks | `is_active`, `is_test`, `outside_shift` | `'TRUE'`, `'FALSE'` |
| `sort_order` campur tipe | `1.0`, `2.0`, `'0'` | |
| `ChecklistPoints` baris tanpa isi | 4 | Hanya kolom tanpa nama berisi `1` |
| `IncidentIndex` | 0 baris | Padahal kode menulis ke sheet ini |
| `tolerance_default_minutes` | 15 di `_meta` | `Settings_Global` kosong |

Catatan: export ini kemungkinan tidak lengkap (`ShiftInstances` kosong). Angka di atas harus dikonfirmasi ulang dengan export penuh (lihat pertanyaan P1).

### 1.4 Kode [SAH]
| Area | Temuan | Lokasi |
| --- | --- | --- |
| Penamaan sheet bulanan | `monthlySheet()` dipanggil 8 kali, tetapi ada 110 referensi `tab_month`/`tabMonth` di 19 file | `lib/google/branch-schema.ts`, banyak route |
| Regex pola bulan | Tersebar di 10 tempat | audit-log route, template-service, incidents, instance-resolver, handover-fields, branch-schema |
| Zona waktu periode | `toISOString().slice(0, 7)` (UTC) di 11 tempat | Tersebar |
| Pencarian incident | `candidateMonths()` hanya 3 bulan terakhir | `lib/incidents.ts` |
| Audit chain | Dihitung per bulan, `seq = rows.length + 1` tanpa kunci | `lib/db/audit.ts` |
| Parser sheet tak dikenal | `getHeaders()` melempar `Unknown sheet` | `lib/google/branch-schema.ts` |
| Arsip | Hanya flag `isActive`, tidak memindahkan data | `lib/admin/lifecycle-policy.ts` |
| Cache baca | TTL 15 detik | `lib/google/sheets.ts` |
| Indeks incident | Ditulis oleh kode, dibaca oleh `findIncidentAcrossBranches` dan stats | `lib/incidents.ts`, route incident |

---

## 2. Desain Target

### 2.1 Prinsip desain
1. Satu tabel logis = satu sheet per periode (tahunan), dengan kolom `tab_month` tetap ada.
2. Semua nilai ditulis dan dibaca lewat normalisasi tipe. Tidak ada `TRUE` sebagai teks.
3. Enum didefinisikan sekali, di satu modul, dan dipakai untuk validasi tulis dan baca.
4. Aktor selalu `Username`. Tidak ada kode, nama tampilan, atau ULID di kolom aktor.
5. Data uji tidak tercampur dengan data nyata (lihat keputusan P5).
6. Setiap spreadsheet cabang punya `schema_version` dan `period_mode` yang bisa dibaca kode.

### 2.2 Template cabang versi 2 [RENCANA]

Sheet statis (dipertahankan):

| Sheet | Keterangan |
| --- | --- |
| `_meta` | `schema_version = 2`, `branch_id`, `period_mode = flat`, `created_at`, `last_migrated_at` |
| `ShiftDefinitions` | Definisi shift |
| `SopCategories` | Kategori SOP |
| `ChecklistPoints` | Poin checklist |
| `HandoverFields` | Field serah terima |
| `ShiftInstances` | Instance shift (dengan `tab_year`, lihat 2.4) |
| `Participants` | Peserta shift |
| `Reports` | Laporan penutupan |
| `Addenda` | Catatan tambahan laporan |
| `IncidentCategories` | Kategori incident (dengan `points` untuk sistem poin, lihat 2.5) |
| `IncidentIndex` | Indeks incident (dipertahankan, lihat 2.6) |
| `Notifications` | Notifikasi |

Sheet dihapus dari template:
- `Summary`: tidak ada pembaca di kode.
- `Snapshots`: tidak ada pembaca di kode.

Sheet periodik (per tahun, bukan per bulan):

| Sheet | Keterangan |
| --- | --- |
| `Entries_YYYY` | Jawaban checklist |
| `EntryLogs_YYYY` | Log aksi (idempotensi) |
| `Handovers_YYYY` | Serah terima |
| `HandoverAcks_YYYY` | Konfirmasi baca |
| `Incidents_YYYY` | Incident |
| `IncidentNotes_YYYY` | Catatan incident |
| `Photos_YYYY` | Metadata foto |
| `AuditLog_YYYY` | Audit append-only |

Template tidak lagi berisi sheet periodik. Sheet periodik dibuat otomatis saat tahun pertama dibutuhkan, dengan header dari modul skema.

### 2.3 Registry v2 [RENCANA]

`Daftar_Cabang` (kolom final):


```

Cabang_ID | Nama_Cabang | Kode | Timezone | Spreadsheet_ID | Branch_Folder_ID | Evidence_Folder_ID | Aktif | Alamat | Schema_Version | Arsip_Spreadsheet_IDs

```

- `Folder_Drive_ID` dihapus setelah Fase 4 selesai (lihat 4.4). Sebelum itu, kolom tetap ada tetapi tidak ditulis.
- `Schema_Version` mengikuti `_meta.schema_version` cabang, dan dipakai untuk memilih jalur baca.
- `Arsip_Spreadsheet_IDs` berisi entri `tahun:spreadsheet_id`, dipisah koma dan diurutkan menurut tahun.

`Settings_Global` (sumber tunggal untuk pengaturan lintas cabang):


```

Key | Value | Keterangan  
tolerance_default_minutes | 15 | default toleransi (lihat P8)  
min_pin_length | 6 |  
session_hours | 12 |  
require_pin_on_close | TRUE |  
allow_skip_required | FALSE |  
app_notice | |  
maintenance_mode | FALSE | dipakai saat migrasi  
incident_link_window_hours | 24 |  
period_mode | flat | nilai default untuk cabang baru

```

Nilai di `Settings_Global` harus terisi. Nilai kosong dianggap error saat startup, bukan diam-diam memakai default.

`Users` (kolom final):


```

User_ID | Username | PIN_Hash | Nama | Role | Cabang_ID | Aktif | Created_At | Updated_At

```

- `PIN` dihapus setelah `PIN_Hash` terisi (lihat 9.1).
- `Must_Change_Pin` dihapus (sesuai keputusan admin-controlled).
- `Cabang_ID` hanya diisi untuk petugas. Admin dibiarkan kosong, dan akses semua cabang ditentukan oleh peran.

`Share_Tokens` dan `Template_Referensi`: tidak berubah.

### 2.4 Kolom tambahan di tabel periodik [RENCANA]
- `tab_month` tetap disimpan di setiap baris data periodik, sebagai `YYYY-MM` dalam zona waktu cabang.
- `ShiftInstances.tab_year` ditambahkan, berisi `YYYY`, agar pembacaan tahun tidak perlu parsing.

### 2.5 Sistem poin incident [RENCANA]
- `IncidentCategories.points` (integer, default 0) ditambahkan.
- `Incidents.points_snapshot` (integer) ditambahkan dan diisi saat incident dibuat. Perubahan poin kategori tidak mengubah riwayat.
- Agregasi poin per cabang dan periode dihitung dari `Incidents_YYYY`, bukan dari sheet terpisah.

### 2.6 IncidentIndex [RENCANA, keputusan dipertahankan]
- Dipertahankan karena dipakai kode (`findIncidentAcrossBranches`, stats-service, incident route).
- Diisi ulang oleh skrip migrasi dari `Incidents_YYYY`, lalu dijaga oleh kode penulisan.
- Rekonsiliasi berkala: skrip harian membandingkan jumlah baris dan mengisi yang hilang.

### 2.7 Kamus tipe dan enum [RENCANA, perlu konfirmasi]

| Kolom | Tipe | Nilai valid |
| --- | --- | --- |
| `is_active`, `is_test`, `outside_shift`, `is_required`, `is_locked`, `is_read`, `out_of_range`, `crosses_midnight`, `opened_outside_hours`, `is_incomplete`, `no_incident_confirmed` | boolean | `TRUE` / `FALSE` (ditulis sebagai tipe boolean lewat RAW, dibaca sebagai boolean) |
| `sort_order`, `version`, `tolerance_minutes`, `number_min`, `number_max`, `shifts_total`, dll. | integer | bilangan bulat |
| `points`, `size_bytes`, `width`, `height`, `seq` | integer | bilangan bulat |
| Timestamp | string | ISO 8601 UTC, `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `shift_date` | string | `YYYY-MM-DD` |
| `severity` | enum | `rendah`, `sedang`, `tinggi` (sesuai `lib/shared/index.ts`) |
| `Incidents.status` | enum | `open`, `selesai` (PERLU KONFIRMASI: daftar lengkap dari kode) |
| `ShiftInstances.status` | enum | `berjalan`, `ditutup`, `ditutup_paksa`, `void` |
| `EntryState` / `state` | enum | `selesai`, `skip`, `batal` |
| `reported_by`, `opened_by`, `closed_by`, `void_by`, `pj_user_id`, `completed_by`, `submitted_by`, `user_id`, `uploaded_by`, `author_id`, `actor_id` | string | `Username` saja (sesuai daftar di SUPERUSER dan DATABASE_SCHEMA) |

Pemetaan migrasi `severity`: `low` menjadi `rendah`, `medium` menjadi `sedang`, `high` menjadi `tinggi`.

### 2.8 Identitas dan kunci [RENCANA]
- Format ID dipertahankan: ULID untuk entitas yang sudah ada, ID deterministik untuk shift dan entry sesuai kode saat ini.
- Format `shift_instance_id` berprefiks kode cabang (`CBGBDG01-20261016-PAGI-7f3a9c2e`) diuji dulu di data baru, tidak dipaksakan ke data lama.

---

## 3. Modul Kode Baru [RENCANA]

Satu modul sumber kebenaran, dipakai oleh semua route dan helper:


```

lib/schema/  
registry.ts definisi sheet statis, periodik, header, tipe, enum  
periods.ts periodeOf(date, timezone), tabMonthOf, tabYearOf, periodSheetName  
normalize.ts normalizeWrite(sheet, row), normalizeRead(sheet, row)  
validate.ts validasi enum dan referensi wajib saat tulis  
version.ts baca schema_version, period_mode dari \_meta

```

Aturan:
- Tidak ada regex pola bulan atau tahun di luar `periods.ts`.
- Tidak ada `toISOString().slice(0, 7)` di luar `periods.ts`.
- Tidak ada string nama sheet yang dibangun manual di luar `periodSheetName()`.
- `getHeaders()` tetap melempar error untuk sheet tak dikenal, tetapi error memuat nama sheet dan cabang.

Migrasi kode yang dipecah per file:

| File | Perubahan |
| --- | --- |
| `lib/google/branch-schema.ts` | Dipindah ke `lib/schema/registry.ts`. File lama menjadi re-export sementara. |
| `lib/incidents.ts` | Ganti `candidateMonths()` dengan pembacaan berdasarkan tahun atau indeks (lihat 4.2). |
| `lib/db/audit.ts` | Periode dari `periods.ts`, zona waktu cabang. Chain per tahun. Lihat 5.3. |
| `lib/instance-resolver.ts` | Pakai `tab_year` untuk pembacaan. Pencarian lintas cabang tetap sama. |
| `lib/handover-fields.ts` | Pakai `periods.ts`. Hapus regex lokal. |
| `lib/admin/template-service.ts` | Hapus pembacaan `Summary` dan `Snapshots`. Hapus regex lokal. |
| `app/api/admin/audit-log/route.ts` | Daftar periode dari `periods.ts`, bukan regex lokal. |
| `app/api/photos/[id]/route.ts` | Pakai `candidateYears()` atau indeks foto, bukan tiga bulan. |
| `app/api/shifts/[id]/*`, `app/api/handovers/*`, `app/api/incidents/*` | Ganti pembentukan periode dan nama sheet dengan helper. |

---

## 4. Urutan Fase

Setiap fase punya kriteria masuk, kriteria selesai, dan rollback. Fase 0 sampai 2 tidak mengubah data di produksi.

### Fase 0: Persiapan (tanpa perubahan data)

Pekerjaan:
1. Dapatkan export penuh semua spreadsheet cabang yang aktif (P1).
2. Buat skrip pemeriksa data (checker) yang menghasilkan laporan per cabang: jumlah baris per sheet, tipe kolom, enum di luar daftar, referensi yatim, identitas aktor yang tidak valid, is_test, dan sheet tak dikenal.
3. Jalankan checker di export yang ada. Simpan hasilnya sebagai baseline.
4. Catat kesepakatan keputusan di bagian 10.

Kriteria selesai:
- Checker berjalan di semua spreadsheet dan menghasilkan laporan.
- Baseline tersimpan di `PLAN/baseline/` (atau lokasi yang disepakati).

Rollback: tidak diperlukan (tidak ada perubahan).

### Fase 1: Perbaikan bug yang berdiri sendiri

Pekerjaan:
1. Perbaiki pencarian incident: `findIncidentAcrossBranches` membaca semua tab periode yang ada, atau cukup mengandalkan `IncidentIndex` dengan fallback yang mencakup seluruh tahun berjalan. Hapus `candidateMonths()`.
2. Ganti zona waktu UTC menjadi zona waktu cabang untuk penentuan periode baru. Tambahkan helper `periodOf(date, timezone)`.
3. Tambahkan test untuk incident yang berumur lebih dari tiga bulan.

Kriteria selesai:
- Incident yang lebih tua dari tiga bulan bisa ditemukan lewat pencarian.
- Tidak ada pemakaian UTC untuk penentuan periode baru.

Rollback: revert commit. Tidak ada perubahan data.

### Fase 2: Modul skema terpusat (tanpa mengubah format sheet)

Pekerjaan:
1. Buat `lib/schema/` (bagian 3). Isi dengan definisi yang sama persis dengan `branch-schema.ts` yang ada.
2. Pindahkan semua regex, pembentukan nama sheet, dan perhitungan periode ke modul baru.
3. Tambahkan `normalizeWrite` dan `normalizeRead`. Tahap ini hanya memastikan tipe boolean dan integer ditulis benar. Data lama dibaca apa adanya dan dinormalisasi saat dibaca.
4. Tambahkan pembaca `_meta.schema_version` dan `period_mode`. Jika `schema_version` kosong, perlakukan sebagai `1` dan tulis peringatan.

Kriteria selesai:
- Tidak ada regex pola bulan atau `toISOString().slice(0, 7)` di luar `periods.ts`. Dicek dengan grep dan dijadikan test.
- Semua test yang ada lulus tanpa perubahan perilaku.
- Tulisan baru memakai boolean dan integer yang benar. Verifikasi dengan membaca sheet hasil tulis.

Rollback: revert commit. Format sheet tidak berubah.

### Fase 3: Dukungan periode tahunan (di balik feature flag)

Pekerjaan:
1. Tambahkan `period_mode` di `Settings_Global` dan `_meta` cabang. Nilai awal `monthly` untuk semua cabang yang ada.
2. `periodSheetName()` menerima mode. Mode `monthly` menghasilkan `Entries_2026-10`, mode `yearly` menghasilkan `Entries_2026`.
3. Pembacaan dan penulisan mengikuti mode cabang. Selama masa transisi, mode `yearly` dapat membaca sheet bulanan lama di tahun yang sama (dual-read), sehingga data tidak hilang sebelum migrasi.
4. Test pembacaan dual-read: data bulanan lama dan baru terbaca bersama, tanpa duplikasi.

Kriteria selesai:
- Cabang uji dengan mode `yearly` berjalan penuh (buka shift, isi checklist, incident, handover, tutup shift, laporan).
- Cabang produksi tetap `monthly` sampai Fase 4.

Rollback: ubah `period_mode` kembali ke `monthly`. Tidak ada perubahan data.

### Fase 4: Migrasi data per cabang

Pekerjaan per cabang:
1. Aktifkan `maintenance_mode` untuk cabang (atau global, lihat P9). Tunggu aktif shift selesai.
2. Buat salinan spreadsheet cabang sebagai cadangan (Drive copy). Catat ID cadangan di registry.
3. Jalankan checker. Jika ada temuan yang tidak diperbaiki otomatis, berhenti dan laporkan.
4. Normalisasi (dry-run dulu, lalu nyata):
   a. Boolean dari teks ke tipe boolean.
   b. Integer dari teks atau float ke integer.
   c. Enum: `low`, `medium`, `high` menjadi `rendah`, `sedang`, `tinggi`. Status dan enum lain dipetakan sesuai hasil konfirmasi.
   d. `reported_by` dan kolom aktor lain: nilai yang bukan `Username` dipetakan lewat tabel `Users` (ULID ke Username bila ada, selain itu ditandai untuk ditinjau).
   e. Baris `is_test = TRUE` dipindah ke sheet uji (P5).
   f. Baris kosong di `ChecklistPoints` dan kolom tanpa nama dihapus setelah dicatat.
5. Buat sheet tahunan `Entries_YYYY`, dan seterusnya. Salin semua baris dari sheet bulanan, pertahankan `tab_month`, dan pertahankan urutan.
6. Verifikasi jumlah baris per tabel: jumlah baris sumber sama dengan jumlah baris tujuan, dengan pengecualian baris uji yang dipindah.
7. Bangun ulang `IncidentIndex` dari `Incidents_YYYY`.
8. Tandai sheet bulanan lama sebagai legacy dengan mengganti nama menjadi `LEGACY_Entries_2026-10`, bukan menghapus. Hapus setelah 30 hari tanpa masalah.
9. Isi `ShiftInstances.tab_year` untuk semua baris.
10. Ubah `_meta.schema_version = 2` dan `period_mode = yearly`.
11. Matikan `maintenance_mode`. Jalankan smoke test (5.2).

Kriteria selesai per cabang:
- Checker lolos tanpa temuan kritis.
- Jumlah baris terverifikasi.
- Smoke test lulus.

Rollback per cabang:
1. Aktifkan `maintenance_mode`.
2. Ganti spreadsheet cabang dengan cadangan (atau kembalikan `period_mode` ke `monthly` dan nama sheet legacy).
3. Catat sebab kegagalan. Ulangi setelah diperbaiki.

Urutan cabang: cabang uji dulu, lalu CBGBDG01, lalu cabang lain satu per satu.

### Fase 5: Audit trail

Pekerjaan:
1. Chain per tahun, dengan anchor. Baris pertama tahun baru memuat `prev_hash` yang merujuk ke `hash` baris terakhir tahun sebelumnya.
2. Chain lama (per bulan) tidak diverifikasi ulang, karena perhitungan hash lama tidak konsisten dengan nilai yang disimpan (null dan string kosong). Ditandai sebagai `legacy_unverifiable` di metadata, bukan dihapus.
3. Penentuan `seq` dan `prev_hash` dilakukan di bawah kunci (lihat P7 untuk pilihan mekanisme).
4. Tambahkan verifier terjadwal (cron) yang memeriksa chain tahun berjalan, dan melaporkan jika ada cabang.

Kriteria selesai:
- Chain tahun berjalan dapat diverifikasi dari sheet.
- Tidak ada `seq` ganda dalam uji paralel sederhana.

Rollback: nonaktifkan verifier. Chain baru dapat dibiarkan.

### Fase 6: Arsip tahunan

Pekerjaan:
1. Untuk setiap cabang, tahun yang sudah selesai (lebih dari 12 bulan berlalu, atau sesuai P3) dipindahkan ke spreadsheet arsip `CBGBDG01 - Arsip 2025`.
2. Arsip hanya-baca. Izin tulis dicabut dari service account untuk arsip.
3. `Arsip_Spreadsheet_IDs` di registry diisi.
4. Resolver membaca arsip hanya saat tahun yang diminta berada di arsip. Pencarian incident lintas tahun memeriksa indeks dulu.
5. Batas sel per spreadsheet dipantau. Ambang peringatan 70 persen dari batas.

Kriteria selesai:
- Data tahun lama bisa dibaca dari arsip.
- Spreadsheet aktif tidak melebihi ambang.

Implementasi fase: resolver arsip dan format Registry tersedia di `lib/google/registry.ts`. Script `scripts/archive-yearly.ts` menyediakan dry-run dan apply dengan pembuatan spreadsheet arsip, penyalinan sheet melalui Sheets API, pembaruan Registry, serta upaya pencabutan izin tulis. Apply tetap dijalankan per cabang setelah pemeriksaan integritas; data live saat ini masih tertahan karena `ShiftInstances` kosong.

Rollback: kembalikan data ke spreadsheet aktif dari arsip (hanya jika belum ada penulisan baru di tahun itu).

### Fase 7: Pembersihan

Pekerjaan:
1. Hapus sheet `LEGACY_*` setelah 30 hari (lihat 4 Fase 4 langkah 8).
2. Hapus `Summary` dan `Snapshots` dari template dan dari spreadsheet cabang.
3. Hapus `PIN` dan `Must_Change_Pin` dari `Users` setelah `PIN_Hash` terverifikasi (lihat 9.1).
4. Hapus `Folder_Drive_ID` dari `Daftar_Cabang` setelah Fase 4 dan dokumen foto selesai.
5. Hapus fallback dan kode mode monthly setelah semua cabang di `yearly`.

Kriteria selesai: tidak ada referensi ke kolom, sheet, atau mode yang dihapus.

Catatan implementasi: `scripts/cleanup-phase7.ts` saat ini hanya menghapus kandidat `LEGACY_YYYY-MM-DD` yang melewati cutoff dan sheet `Summary`/`Snapshots`. Penghapusan live diblokir selama masih ada cabang `monthly`; kolom `PIN`, `Must_Change_Pin`, dan `Folder_Drive_ID` belum dihapus karena dependensi keamanan, foto, dan migrasi belum selesai.

### Fase 8: Dokumentasi

Pekerjaan:
1. Perbarui `PLAN/DATABASE_SCHEMA.md` sebagai satu-satunya acuan skema.
2. Tandai `ERD.md` dan `ERD-CHEN.md` sebagai turunan, dan perbarui atau arsipkan.
3. Perbarui `AGENTS.md` bagian arsitektur dan batasan konsistensi.
4. Tulis ADR di `PLAN/adr/0001-sheets-yearly-periods.md` dengan keputusan, alternatif, dan kriteria keluar (lihat 10).
5. Arsipkan dokumen historis (`plan-performance.md`, `REFACTOR.md`) jika file tersebut ada; pada checkout ini tidak ditemukan.

---

## 5. Pengujian

### 5.1 Otomatis
- Test modul `periods.ts`: batas tahun, zona waktu cabang, Desember ke Januari, periode dari tanggal UTC di tengah malam WIB.
- Test `normalizeWrite` dan `normalizeRead` untuk semua kolom boolean, integer, dan enum.
- Test `findIncidentAcrossBranches` untuk incident berumur 1, 3, 6, dan 13 bulan.
- Test migrasi dengan fixture kecil: baris valid, baris dengan teks boolean, enum lama, identitas campuran, dan baris uji.
- Test dual-read: data bulanan dan tahunan muncul tanpa duplikasi.
- Test audit chain: urutan, anchor antar tahun, dan deteksi perubahan.
- Test fake Sheets (`tests/helpers/fake-sheets.ts`) diperbarui untuk tipe dan periode baru.

Perintah: npm run test, npm run lint, npm run typecheck, npm run build.

### 5.2 Smoke test manual per cabang setelah migrasi
- [ ] Buka shift baru, isi satu entry, tutup shift, laporan terbentuk.
- [ ] Buat incident baru, cari incident lama (lebih dari tiga bulan).
- [ ] Buat handover, konfirmasi baca dari shift berikutnya.
- [ ] Unggah satu foto (jika fitur foto sudah aktif).
- [ ] Lihat dashboard admin: angka sesuai dengan hitungan manual.
- [ ] Verifikasi audit chain tahun berjalan.
- [ ] Dua akun petugas mengisi checklist yang sama: konflik tampil dengan benar.

### 5.3 Pengukuran performa [RENCANA]
Perencanaan performa sebelumnya belum punya baseline. Sebelum Fase 3:
- Ukur p50 dan p95 untuk `GET /api/shifts`, `GET /api/shifts/[id]/progress`, dan pencarian incident.
- Ukur jumlah panggilan Sheets per request.
- Catat ukuran sheet terbesar dan jumlah baris.

Setelah Fase 4, ukur ulang dengan kondisi yang sama. Tetapkan target setelah baseline ada, bukan sebelumnya.

---

## 6. Migrasi Data: Detail Keamanan
- Setiap migrasi dijalankan dengan `dryRun = true` dulu. Laporan dry-run disimpan.
- Skrip migrasi tidak menghapus apa pun. Penghapusan dilakukan di Fase 7, setelah verifikasi.
- Skrip bisa diulang: jika dijalankan dua kali, hasilnya sama (idempotent). Sheet tahunan yang sudah ada tidak diduplikasi.
- Semua penulisan memakai `valueInputOption: 'RAW'`.
- Log migrasi menyimpan: waktu, cabang, sheet, jumlah baris sumber dan tujuan, dan daftar baris yang dipindah atau diubah.

---

## 7. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Export tidak lengkap | Migrasi merusak relasi | Fase 0 wajib dengan export penuh |
| Batas 10 juta sel tercapai sebelum arsip siap | Penulisan gagal | Ambang peringatan, arsip di Fase 6 harus dikerjakan segera setelah Fase 4 |
| Audit chain lama tidak bisa diverifikasi | Bukti audit lama lemah | Ditandai `legacy_unverifiable`, dijelaskan kepada pengguna |
| Data uji tercampur dan terhitung di laporan | Angka tidak akurat | Fase 4 memindahkan `is_test` ke sheet uji, filter wajib di semua query |
| Pembacaan tahunan lebih lambat | Respons lebih lama | Ukur di 5.3, pertimbangkan indeks tambahan |
| Dua cabang berbeda versi setelah migrasi bertahap | Bug sulit dilacak | `schema_version` dicek saat startup, kode menolak versi yang tidak dikenal |
| Pengguna menulis langsung ke Sheets | Data rusak | Proteksi rentang di Sheets, larangan tertulis, dan checker harian |
| Penulisan paralel tanpa kunci | `seq` ganda, indeks tidak sinkron | Lihat P7, rekonsiliasi harian |
| Batas Google Sheets berubah | Perencanaan tidak akurat | Verifikasi batas di dokumentasi resmi sebelum Fase 6 |

---

## 8. Kriteria Keberhasilan

- [ ] Semua cabang berada di `schema_version = 2` dan `period_mode = yearly`.
- [ ] Checker menghasilkan nol temuan kritis (tipe, enum, referensi, identitas).
- [ ] Tidak ada regex atau pembentukan periode di luar `lib/schema/periods.ts`.
- [ ] Pencarian incident menemukan data berumur lebih dari tiga bulan.
- [ ] Jumlah tab per cabang turun dari 8 per bulan menjadi 8 per tahun.
- [ ] Tidak ada referensi ke `Summary`, `Snapshots`, `Folder_Drive_ID`, `PIN`, atau `Must_Change_Pin`.
- [ ] Dokumen skema tunggal dan ADR tersedia.
- [ ] Pengukuran performa sebelum dan sesudah tercatat.

---

## 9. Prasyarat Keamanan (dikerjakan dalam rencana ini atau terpisah, lihat P6)

### 9.1 PIN
- Tambahkan `PIN_Hash` dengan algoritma yang kuat (argon2id atau bcrypt, sesuai ketersediaan di runtime).
- Migrasi: setiap PIN lama di-hash saat login berhasil berikutnya, lalu nilai `PIN` dikosongkan.
- Setelah semua PIN di-hash, kolom `PIN` dihapus (Fase 7).
- Reset PIN oleh admin menulis `PIN_Hash` baru. Tidak ada PIN yang ditampilkan atau disimpan dalam bentuk teks.

### 9.2 Akses spreadsheet
- Service account hanya punya akses yang diperlukan di setiap spreadsheet.
- Spreadsheet arsip hanya-baca.
- Tidak ada izin `anyoneWithLink` pada spreadsheet data.

---

## 10. Pertanyaan untuk Keputusan

Jawaban akan mengubah rencana di bagian yang disebutkan. Pertanyaan yang belum dijawab dianggap default yang tertulis.

P1. Apakah ada export penuh semua spreadsheet cabang, termasuk `ShiftInstances` dan `Entries_*` yang kosong di file yang diupload? Tanpa ini, Fase 0 tidak bisa diselesaikan.

P2. Export registry yang diupload kosong pada `Daftar_Cabang` dan `Users`. Apakah itu sengaja dikosongkan, atau data live ada di tempat lain? Dibutuhkan untuk memetakan `reported_by` ULID ke Username.

P3. Berapa lama data periodik tetap di spreadsheet aktif sebelum dipindah ke arsip? Default yang diusulkan: 12 bulan.

P4. Apakah incident tanpa kategori (25 kasus) boleh tetap ada? Pilihan: (a) diberi kategori default "Belum dikategorikan", (b) dibiarkan kosong dan ditandai, (c) diwajibkan saat membuat incident. Default yang diusulkan: (a) untuk data lama, (c) untuk data baru.

P5. Data uji (is_test) mau diapakan? Pilihan: (a) dipindah ke sheet uji di spreadsheet yang sama, (b) dipindah ke spreadsheet uji terpisah, (c) dihapus setelah dicatat. Default yang diusulkan: (b).

P6. Apakah hashing PIN dikerjakan di rencana ini (Fase 7), atau di rencana keamanan terpisah yang didahulukan? Default yang diusulkan: didahulukan sebagai rencana sendiri, karena ini risiko paling serius dan tidak bergantung pada periode.

P7. Mekanisme penulisan audit: (a) kunci di Apps Script (LockService, perlu cabang ke GAS), (b) kunci lewat satu antrean penulisan di server, (c) diterima risikonya dan diverifikasi harian. Default yang diusulkan: (c) untuk sekarang, lalu (a) saat GAS sudah dipakai untuk foto.

P8. Toleransi shift: nilai default 15 menit disimpan di `Settings_Global` saja, atau cabang boleh punya nilai sendiri (override di `_meta`)? Default yang diusulkan: default di `Settings_Global`, override per cabang hanya jika diperlukan.

P9. Maintenance saat migrasi: per cabang atau global? Default yang diusulkan: per cabang, dengan jendela waktu di luar jam shift.

P10. Target skala untuk perencanaan: berapa cabang dalam 12 bulan ke depan, dan berapa shift per hari per cabang? Dibutuhkan untuk memastikan batas Google Sheets masih memadai, atau untuk memutuskan kriteria keluar ke database.

---

## 11. Kriteria Keluar ke Database Relasional (ADR)

Pindah ke database relasional dipertimbangkan jika salah satu terjadi:
- Jumlah cabang aktif lebih dari 10, atau volume lebih dari 50 shift per hari.
- Ada cabang yang mendekati batas sel meski sudah diarsipkan.
- Rekonsiliasi indeks gagal lebih dari sekali dalam sebulan.
- Pelaporan lintas periode memerlukan lebih dari 10 detik.
- Kebutuhan constraint dan transaksi muncul di fitur baru (misalnya sistem poin yang butuh konsistensi kuat).

Keputusan dicatat di ADR. Angka di atas dipakai sebagai titik evaluasi, bukan aturan otomatis.

---

## 12. Estimasi Relatif

| Fase | Ukuran | Risiko |
| --- | --- | --- |
| 0. Persiapan | S | Rendah |
| 1. Bug pencarian dan UTC | S | Rendah |
| 2. Modul skema | M | Sedang |
| 3. Dukungan tahunan | M | Sedang |
| 4. Migrasi data | L | Tinggi |
| 5. Audit | M | Tinggi |
| 6. Arsip | M | Sedang |
| 7. Pembersihan | S | Rendah |
| 8. Dokumentasi | S | Rendah |
| 9. PIN (jika dikerjakan di sini) | M | Sedang |

Ukuran relatif (S, M, L). Tidak ada estimasi hari, karena bergantung pada keputusan di bagian 10 dan jumlah cabang.

---

## 13. Catatan

- Rencana ini tidak mengubah perilaku produk, hanya cara data disimpan dan dibaca.
- Setiap fase bisa berhenti di titik yang aman. Fase 0 sampai 2 tidak mengubah data.
- Jika keputusan di bagian 10 berubah, bagian yang terkait harus diperbarui sebelum mulai.
- Edit dokumen ini sebagai pelaporan setelah selesai mengerjakan sesuatu sebagai bahan historical refactoring. 

```
