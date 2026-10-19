# Database Schema MyCheck

> Status: acuan skema implementasi per 2026-10-18.
>
> MyCheck memakai Google Sheets API, bukan database SQL. Definisi nama sheet
> dan header runtime berasal dari `lib/schema/registry.ts`; import lama dari
> `lib/google/branch-schema.ts` hanya kompatibilitas.

## Penyimpanan dan metadata

- Registry menyimpan `Daftar_Cabang`, `Users`, `Settings_Global`,
  `Share_Tokens`, dan `Template_Referensi`.
- `Daftar_Cabang.Spreadsheet_ID` menunjuk spreadsheet aktif cabang.
- `Arsip_Spreadsheet_IDs` memakai format `tahun:spreadsheet_id`, dipisahkan
  koma.
- `_meta` memakai kolom `key`, `value`; metadata penting adalah
  `schema_version`, `period_mode`, `branch_id`, `created_at`, dan
  `last_migrated_at`.
- Foto binary berada di Google Drive; `Photos` menyimpan metadata dan referensi
  file saja.
- Google Sheets tidak menyediakan transaksi, foreign key, unique index, atau
  row lock. Konsistensi ditegakkan oleh aplikasi, rekonsiliasi, audit, dan
  checker.

## Registry

### `Daftar_Cabang`

`Cabang_ID`, `Nama_Cabang`, `Kode`, `Timezone`, `Spreadsheet_ID`,
`Folder_Drive_ID` (legacy), `Aktif`, `Alamat`, `Arsip_Spreadsheet_IDs`,
`Branch_Folder_ID`, `Evidence_Folder_ID`.

`Folder_Drive_ID` masih dibaca sebagai fallback sampai alur foto dan migrasi
selesai. `Branch_Folder_ID` adalah folder cabang baru, sedangkan
`Evidence_Folder_ID` adalah folder bukti/foto.

### `Users`

`User_ID`, `Username`, `PIN`, `Nama`, `Role`, `Cabang_ID`, `Aktif`,
`Must_Change_Pin`, `Created_At`.

`PIN` masih plaintext pada implementasi sekarang dan merupakan risiko yang
belum selesai. Penghapusan `PIN`/`Must_Change_Pin` ditunda sampai migrasi
`PIN_Hash` pada rencana keamanan terpisah terverifikasi.

## Mode penyimpanan periode

Mode target cabang baru adalah `flat`: sheet transaksi memakai nama generik
(`Entries`, `Incidents`, `Photos`, dan seterusnya), sedangkan tanggal/tahun
disimpan di kolom baris. Arsip tahunan dibuat manual dari UI atau command dan
menjadi spreadsheet terpisah. Mode `monthly` dan `yearly` tetap dibaca untuk
kompatibilitas cabang lama.

## Sheet statis cabang

| Sheet | Header |
| --- | --- |
| `ShiftDefinitions` | `id`, `name`, `start_time`, `end_time`, `crosses_midnight`, `sort_order`, `is_active`, `created_at`, `updated_at`, `version` |
| `SopCategories` | `id`, `shift_definition_id`, `name`, `sort_order`, `is_active`, `created_at`, `updated_at`, `version`, `color` |
| `ChecklistPoints` | `id`, `sop_category_id`, `title`, `instruction`, `input_type`, `input_types`, `options`, `is_required`, `target_time`, `tolerance_minutes`, `active_days`, `number_min`, `number_max`, `sort_order`, `is_active`, `points`, `created_at`, `updated_at`, `version` |
| `HandoverFields` | `id`, `shift_definition_id`, `label`, `field_type`, `input_types`, `options`, `is_required`, `sort_order`, `is_active`, `created_at`, `updated_at`, `version` |
| `ShiftInstances` | `id`, `shift_definition_id`, `shift_date`, `tab_month`, `status`, `pj_user_id`, `opened_by`, `opened_at`, `opened_outside_hours`, `closed_at`, `closed_by`, `close_type`, `force_close_reason`, `is_incomplete`, `no_incident_confirmed`, `void_reason`, `void_by`, `void_at`, `is_test`, `snapshot_encoding`, `template_snapshot`, `snapshot_hash`, `created_at`, `updated_at`, `version`, `tab_year` |
| `Participants` | `id`, `shift_instance_id`, `user_id`, `first_action_at`, `first_action_type`, `created_at` |
| `Reports` | `id`, `shift_instance_id`, `report_number`, `generated_by`, `generated_at`, `is_locked`, `summary_stats`, `content_hash`, `unlock_count`, `last_unlocked_at`, `last_unlocked_by`, `created_at`, `updated_at`, `version` |
| `Addenda` | `id`, `report_id`, `author_id`, `note`, `created_at` |
| `Summary` | `id`, `summary_date`, `shift_definition_id`, `shifts_total`, `shifts_closed_normal`, `shifts_closed_forced`, `shifts_void`, `required_total`, `required_done`, `required_skipped`, `timed_on_time`, `timed_early`, `timed_late`, `incidents_total`, `incidents_open`, `incidents_by_category`, `handovers_read`, `participants_count`, `computed_at` |
| `Snapshots` | `id`, `shift_instance_id`, `part_no`, `chunk`, `created_at` |
| `IncidentIndex` | `incident_id`, `tab_month`, `status`, `category_id`, `shift_instance_id`, `outside_shift`, `reported_at`, `is_test`, `updated_at` |
| `IncidentCategories` | `id`, `name`, `sort_order`, `is_active`, `points`, `penalty_min_severity`, `created_at`, `updated_at` |
| `Notifications` | `id`, `user_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at` |
| `_meta` | `key`, `value` |
| `Drafts` | `id`, `shift_instance_id`, `user_id`, `shift_date`, `payload`, `client_updated_at`, `created_at`, `updated_at`, `version` |
| `ShiftPjAssignments` | `id`, `shift_instance_id`, `user_id`, `started_at`, `ended_at`, `is_current`, `source`, `created_at` |
| `ScoreLedger` | `id`, `scope_type`, `subject_id`, `branch_id`, `shift_instance_id`, `report_id`, `metric_type`, `score_version`, `points_available`, `points_earned`, `incident_penalty`, `final_points`, `score_percent`, `attribution_ratio`, `calculated_at`, `created_at` |

`Summary` dan `Snapshots` masih tercantum karena masih ditemukan pada
template/live; kandidat penghapusannya diperiksa oleh
`npm run cleanup:phase7`.

## Sheet periodik

| Base | Header |
| --- | --- |
| `Entries` | `id`, `shift_instance_id`, `point_ref`, `state`, `value`, `out_of_range`, `photo_ids`, `completed_by`, `completed_at`, `timing_label`, `timing_delta_minutes`, `skip_reason`, `created_at`, `updated_at`, `version` |
| `EntryLogs` | `id`, `shift_instance_id`, `entry_id`, `point_ref`, `action`, `outcome`, `user_id`, `winner_user_id`, `prev_state`, `new_state`, `value`, `note`, `client_action_id`, `client_at`, `at`, `created_at` |
| `Handovers` | `id`, `shift_instance_id`, `values`, `free_text`, `photo_ids`, `submitted_by`, `submitted_at`, `created_at`, `updated_at` |
| `HandoverAcks` | `id`, `handover_id`, `reading_shift_instance_id`, `user_id`, `read_at`, `created_at` |
| `Incidents` | `id`, `shift_instance_id`, `tab_month`, `category_id`, `description`, `occurred_at`, `reported_by`, `reported_at`, `status`, `outside_shift`, `link_source`, `linked_by`, `linked_at`, `source_entry_id`, `severity`, `points_snapshot`, `penalty_min_severity_snapshot`, `status_changed_by`, `status_changed_at`, `is_test`, `created_at`, `updated_at`, `version` |
| `IncidentNotes` | `id`, `incident_id`, `author_id`, `author_role`, `note`, `created_at` |
| `Photos` | `id`, `shift_instance_id`, `owner_type`, `owner_id`, `storage`, `file_ref`, `mime`, `size_bytes`, `width`, `height`, `sort_order`, `status`, `uploaded_by`, `uploaded_at`, `purged_at`, `created_at`, `sha256` |
| `EntryReviews` | `id`, `shift_instance_id`, `entry_id`, `point_ref`, `worker_user_id`, `review_status`, `base_points`, `earned_points`, `awarded_points`, `points_adjustment`, `review_note`, `reviewed_by`, `reviewed_at`, `review_stage`, `version`, `created_at` |
| `AuditLog` | `id`, `seq`, `at`, `actor_id`, `action`, `object_type`, `object_id`, `branch_id`, `shift_instance_id`, `before`, `after`, `reason`, `prev_hash`, `hash` |

## Relasi logis

- `SopCategories.shift_definition_id` → `ShiftDefinitions.id`.
- `ChecklistPoints.sop_category_id` → `SopCategories.id`.
- `HandoverFields.shift_definition_id` → `ShiftDefinitions.id`.
- `ShiftInstances.shift_definition_id` → `ShiftDefinitions.id`.
- `Participants`, `Entries`, `Handovers`, `Reports`, dan `Incidents` merujuk
  `ShiftInstances` melalui ID masing-masing.
- `HandoverAcks` → `Handovers`; `Addenda` → `Reports`; `IncidentNotes` →
  `Incidents`.
- `Photos` memakai `owner_type` + `owner_id` untuk relasi polimorfik.
- `ShiftPjAssignments.user_id` (pj) merujuk `ShiftInstances` + Users; kolom
  `is_current` menandai PJ aktif, `ended_at` menutup riwayat untuk rasio waktu
  scoring. Shift lama tanpa baris assignment memakai fallback
  `ShiftInstances.pj_user_id` dengan rasio 1.
- `EntryReviews.entry_id` → `Entries.id`; `worker_user_id` adalah pemilik entry,
  bukan role. `review_stage` = `live`/`final`; koreksi memperbarui baris yang
  sama (versi naik), tidak menambah baris baru.
- `ScoreLedger` id upsert deterministik per
  (`report_id`, `scope_type`, `subject_id`, `metric_type`, `score_version`):
  retry tidak menduplikasi, koreksi review final menyegarkan nilai.
  Rollback: `SCORE_DEPLOY=0` mematikan penulisan ledger (close/review final)
  tanpa menghapus kolom atau data yang sudah ada.
- `Reports.summary_stats` berisi `total_required`, `done`, `skipped`, dan
  breakdown scoring `score_version`, `score_available`, `score_earned`,
  `completion_percent`, `incident_penalty`, `score_final`, `score_percent`;
  report lama defeat ke `'{}'` (fallback tanpa skor).

Relasi ini adalah konvensi aplikasi, bukan constraint Google Sheets.

## Operasional

- `npm run check:data -- --branch=<Cabang_ID>`: checker read-only.
- `npm run migrate:data-yearly -- --branch=<Cabang_ID>`: dry-run; `--apply`
  membuat backup dan tidak menghapus sheet bulanan.
- `npm run archive:data -- --branch=<Cabang_ID> --year=<YYYY>`: dry-run;
  `--apply` membuat spreadsheet arsip dan memperbarui Registry.
- `npm run cleanup:phase7`: dry-run; apply membutuhkan semua cabang flat/yearly,
  konfirmasi eksplisit, dan backup Drive sebelum penghapusan.

Perubahan skema harus dimulai dari `lib/schema/registry.ts` dan dokumen ini.
`PLAN/ERD.md` serta `PLAN/ERD-CHEN.md` hanya turunan visual.
