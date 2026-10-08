# DATABASE_SCHEMA.md — Struktur Data mycheck

> **Menggantikan skema PostgreSQL.**mycheck memakai **Google Sheets API**,
> bukan database SQL. Tidak ada migration, tidak ada ORM, tidak ada transaksi.
>
> Sumber kebenaran yang paling persis adalah **spreadsheet `Template_cabang_mycheck`**;
> dokumen ini menjelaskan strukturnya. Definisi kolom di kode ada di
> `lib/google/branch-schema.ts`.

## 1. Konsep inti

**Cabang = spreadsheet.** Tidak ada tabel `branches` dan tidak ada kolom
`branch_id`. Satu spreadsheet per cabang, jadi sudah secara implisit berada di
spreadsheet yang benar.

Ada dua spreadsheet yang berbeda sifat:

| | **Registry** | **Spreadsheet cabang** |
|---|---|---|
| Jumlah | 1 (global) | 1 per cabang |
| Isi | cabang, user, setting global, share token | template shift + data operasional cabang |
| Konvensi kolom | **PascalCase** (`Cabang_ID`, `Nama_Cabang`) | **snake_case** (`shift_date`, `created_at`) |
| Env | `REGISTRY_SPREADSHEET_ID` | kolom `Spreadsheet_ID` di Registry |

Konvensi nama berbeda antara Registry (PascalCase, mengikuti stokis) dan
spreadsheet cabang (snake_case). Ini disengaja — jangan disamakan.

## 2. Registry

### `Daftar_Cabang`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `Cabang_ID` | string | PK. Sama dengan `Kode`. |
| `Nama_Cabang` | string | Tampil di UI. |
| `Kode` | string | Kode unik cabang. |
| `Timezone` | string | IANA, mis. `Asia/Jakarta`. Meng bestimmt tanggal shift. |
| `Spreadsheet_ID` | string | ID spreadsheet cabang. Kosong = cabang nonaktif. |
| `Folder_Drive_ID` | string | Folder Drive untuk unggah foto. |
| `Aktif` | bool | Hanya cabang aktif yang bisa diakses. |

> Cabang dibuat **nonaktif**. Wajib diisi `Spreadsheet_ID` dulu sebelum bisa
> diaktifkan — API menolak mengaktifkan cabang tanpa spreadsheet.

### `Users`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `User_ID` | string | PK, format `U-<timestamp>`. |
| `Username` | string | Unik, dipakai sebagai identitas sesi. |
| `PIN` | string | **Plaintext** (6 digit). Pinjaman keamanan yang disepakati. |
| `Nama` | string | Nama tampilan. |
| `Role` | string | `admin` \| `petugas`. |
| `Cabang_ID` | string | Id cabang dipisah koma. **Kosong untuk admin** (admin akses semua). |
| `Aktif` | bool | |
| `Must_Change_Pin` | bool | Diset `TRUE` saat admin reset PIN user. |
| `Created_At` | string | ISO UTC. |

Tidak ada tabel `user_branch_access` — akses cabang disimpan di kolom
`Cabang_ID`. Tidak ada `pin_fail_attempts` (tidak ada lockout/rate limiting).

### `Settings_Global`
`Key` | `Value`. Tipe (`int`/`bool`/`string`/`text`) **tidak** disimpan di sheet —
katalognya ada di kode: `lib/admin/settings-catalog.ts`. Ini konsekuensi sheet
yang hanya punya dua kolom.

### `Share_Tokens`
Token laporan publik. Kolom: `id`, `report_id`, `branch_id`, `token`,
`created_by`, `created_at`, `expires_at`, `revoked_at`, `access_count`,
`last_accessed_at`, `share_note`, `visibility`.

Token disimpan apa adanya (bukan hash) agar route publik bisa mencarinya dengan
satu pembacaan sheet.

### `Template_Referensi`
`Template_Spreadsheet_ID` — pointer ke template master.

## 3. Spreadsheet cabang

### 3.1 Sheet konfigurasi (statis)

| Sheet | Fungsi | Kolom inti |
|---|---|---|
| `ShiftDefinitions` | Definisi shift | `id`, `name`, `start_time`, `end_time`, `crosses_midnight`, `sort_order`, `is_active`, `created_at`, `updated_at`, `version` |
| `SopCategories` | Kategori SOP per shift | `id`, `shift_definition_id`, `name`, `sort_order`, `is_active`, … |
| `ChecklistPoints` | Item checklist per kategori | `id`, `sop_category_id`, `title`, `instruction`, `input_type`, `is_required`, `target_time`, `tolerance_minutes`, `active_days`, `number_min`, `number_max`, `sort_order`, `is_active`, … |
| `HandoverFields` | Field serah terima per shift | `id`, `shift_definition_id`, `label`, `field_type`, `options`, `is_required`, `sort_order`, `is_active`, … |
| `IncidentCategories` | Kategori incident | `id`, `name`, `sort_order`, `is_active`, `created_at`, `updated_at` |
| `Notifications` | Notifikasi per cabang | `id`, `user_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at` |
| `_meta` | Key/value per cabang | `key`, `value` (mis. `tolerance_default_minutes`, `version`) |

### 3.2 Sheet operasional (statis)

| Sheet | Keterangan |
|---|---|
| `ShiftInstances` | Inti. Punya `tab_month` yang menentukan tab bulanan mana yang dipakai instance tersebut. |
| `Participants` | `id`, `shift_instance_id`, `user_id`, `first_action_at`, `first_action_type`, `created_at` |
| `Reports` | `id`, `shift_instance_id`, `report_number`, `is_locked`, `summary_stats`, `content_hash`, `unlock_count`, … |
| `Addenda` | `id`, `report_id`, `author_id`, `note`, `created_at` |
| `Summary` | Agregat harian per shift definition |
| `Snapshots` | Potongan snapshot bila terlalu besar untuk satu sel |
| `IncidentIndex` | Indeks ringan: satu baris per incident (`incident_id`, `tab_month`, `status`, `category_id`, …) untuk mempercepat daftar |

### 3.3 Sheet bulanan (transaksional)

Berformat `<Nama>_<YYYY-MM>`, dipisah per bulan agar tidak meledak ukurannya.
Tab dibuat otomatis oleh kode saat pertama dipakai (`ensureMonthlySheet`).

| Sheet bulanan | Keterangan |
|---|---|
| `Entries_<bulan>` | Jawaban checklist per point |
| `EntryLogs_<bulan>` | Log tiap aksi + `client_action_id` (idempotency) |
| `Handovers_<bulan>` | Isi serah terima |
| `HandoverAcks_<bulan>` | Konfirmasi sudah membaca handover |
| `Incidents_<bulan>` | Laporan incident |
| `IncidentNotes_<bulan>` | Catatan koreksi incident (BR-41) |
| `Photos_<bulan>` | Metadata foto |
| `AuditLog_<bulan>` | Audit append-only + hash chain (`seq`, `prev_hash`, `hash`) |

Tab mana yang dipakai sebuah shift ditentukan oleh `ShiftInstances.tab_month`.
Sheet default Google (`Sheet1`) **wajib** dihapus — script setup sudah melakukannya.

### 3.4 Snapshot & audit

- **Snapshot template** disimpan sebagai JSON di `ShiftInstances.template_snapshot`
  (`snapshot_encoding` = `json`). Perubahan template setelah shift dibuka tidak
  memengaruhi shift yang sedang berjalan (BR-05).
- **Hash chain audit** dihitung di dalam satu tab bulanan, jadi chain **di-reset
  setiap ganti bulan** — bukan global seperti di PostgreSQL. Ini perbedaan yang
  diterima, bukan bug.

## 4. Aturan yang wajib dijaga

1. **`valueInputOption: 'RAW'` wajib** untuk semua tulisan. Dengan
   `USER_ENTERED`, Sheets mengubah `"2026-10-08"` → `46303` dan `"true"` →
   `TRUE`, yang merusak `shift_date`, `tab_month`, dan nilai centang.
2. Boolean disimpan sebagai string `'TRUE'`/`FALSE`; dibaca lewat `asBool()`.
3. **Tidak ada transaksi.** Operasi lintas sheet tidak atomik. Kalau sebagian
   gagal, lakukan kompensasi atau kembalikan seperti semula.
4. **Tidak ada unique index.** BR-01 dijaga pengecekan aplikasi sebelum insert —
   pada request paralel masih mungkin ada race (dulu dijaga advisory lock).
5. **Tidak ada row lock.** BR-12 dijaga pengecekan state sebelum update.
6. Hapus baris secara fisik hanya boleh untuk operasi admin yang memang
  Bike menghapus konfigurasi. Lifecycle bisnis (shift, incident, laporan)
   **tidak** menghapus baris — hanya ubah status.

## 5. Menambah kolom

1. Ubah header di Registry atau di seluruh spreadsheet cabang.
2. Update `lib/google/branch-schema.ts` (`STATIC_SHEETS` atau `MONTHLY_SHEETS`).
3. Update pemanggilnya di `lib/store.ts` / `lib/admin/template-service.ts`.
4. Tidak ada migration — tapi **penyesuaian** ke spreadsheet cabang lama wajib
   dilakukan manual, karena kode tidak menambah kolom yang belum ada.