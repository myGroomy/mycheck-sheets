# Nilai Cabang/User, Ledger, dan Review Item

## Fase 10 — Nilai cabang, PJ, dan user lintas cabang

### Nilai cabang

- branch_earned = checklist_earned - incident_penalty.
- branch_available = total_checklist_weight.
- branch_score = max(0, branch_earned) / branch_available * 100.
- Tampilkan weighted aggregate dan rata-rata persentase setiap shift.
- Nilai melekat pada branch_id dan tidak terpengaruh user bertugas.

### ShiftPjAssignments

Tambahkan sheet cabang dengan header:

id, shift_instance_id, user_id, started_at, ended_at, is_current, source, created_at

- Saat shift dibuka buat assignment PJ pertama.
- Saat admin mengganti PJ, tutup assignment lama dan buat assignment baru.
- Saat shift ditutup hitung proporsi waktu setiap PJ.
- Shift lama tanpa histori memakai pj_user_id dengan rasio 1.0.

### Nilai PJ

- user_pj_earned = shift_final_score × pj_time_ratio.
- user_pj_available = shift_available × pj_time_ratio.
- user_pj_score = user_pj_earned / user_pj_available × 100.

### Nilai kontribusi user

- action_earned = total bobot checklist yang dimenangkan user.
- action_available = total bobot checklist pada shift terkait.
- action_score = action_earned / action_available × 100.
- Sumber: Entries.completed_by, Entries.state, snapshot point, Participants.user_id.
- Concurrency tetap menentukan satu pemenang per item.

### Penalti incident user

- Penalti cabang masuk skor cabang.
- Penalti PJ masuk skor kepemimpinan sesuai rasio.
- Penalti user masuk user pada Incidents.reported_by.
- Incident di luar shift tidak mengurangi skor shift.
- Penalti disimpan sebagai snapshot.

### Skor total user

- user_total_score = (user_pj_score × 50%) + (user_action_score × 50%).
- Jika satu dimensi belum tersedia, tampilkan Belum tersedia, bukan nol.
- Tetap tampilkan jumlah shift PJ, kontribusi, cabang, checklist selesai, dan penalti.

## Fase 11 — ScoreLedger dan API nilai

Tambahkan ScoreLedger pada Registry dengan header:

id, scope_type, subject_id, branch_id, shift_instance_id, report_id, metric_type, score_version, points_available, points_earned, incident_penalty, final_points, score_percent, attribution_ratio, calculated_at, created_at

- scope_type: branch atau user.
- metric_type: branch, pj, action, atau incident.
- subject_id: branch ID atau user ID.
- attribution_ratio: rasio PJ atau 1 untuk branch/action.
- report_id adalah sumber immutable.
- Idempotency key: report_id + scope_type + subject_id + metric_type + score_version.
- Retry close tidak menggandakan nilai.
- Sediakan rebuild ledger dari report untuk recovery.

Endpoint:

- GET /api/admin/scores/branches
- GET /api/admin/scores/users
- GET /api/admin/scores/users/[id]
- GET /api/admin/scores/branches/[id]
- GET /api/reports/[id] dengan breakdown scoring.
- Endpoint close untuk ledger idempoten.
- Endpoint pergantian PJ untuk ShiftPjAssignments.

Filter: branchId, userId, dateFrom, dateTo, shiftDefinitionId, metricType. Semua endpoint wajib memvalidasi akses cabang server-side.

## Fase 12 — Review checklist dan penilaian individual

### Model kolaboratif

- Satu shift dapat memiliki satu PJ dan banyak participant.
- Setiap item memiliki satu user utama melalui Entries.completed_by.
- Konflik item mengikuti concurrency.
- Jika satu user bekerja, seluruh item tercatat kepada user tersebut.
- Participants tetap menjadi daftar user yang mengikuti shift.

### EntryReviews

Tambahkan sheet periodik dengan header:

id, shift_instance_id, entry_id, point_ref, worker_user_id, review_status, base_points, awarded_points, points_adjustment, review_note, reviewed_by, reviewed_at, review_stage, version, created_at

- review_status: pending, valid, partial, invalid.
- review_stage: live atau final.
- worker_user_id disalin dari Entries.completed_by dan tidak boleh diubah.
- Item lama tanpa review memakai nilai otomatis dari Entries.
- Histori Entries tidak diubah; review disimpan sebagai record/version baru.

### Aturan review

- Sebelum review item memakai base_points.
- valid memberi seluruh base_points.
- partial memakai awarded_points pilihan admin.
- invalid memberi nilai 0.
- awarded_points dibatasi 0 sampai base_points.
- points_adjustment = awarded_points - base_points.
- Catatan wajib jika nilai akhir berbeda.
- Review live provisional dan dapat diperbarui.
- Review final menjadi sumber nilai resmi setelah shift ditutup.

Tahapan:

1. Admin meninjau item live.
2. Saat shift ditutup, item belum direview masuk antrean final.
3. Admin mengonfirmasi status dan nilai.
4. Admin finalisasi review shift.
5. Perubahan setelah finalisasi hanya melalui koreksi ter-audit.

Status review shift: belum_direview, review_sementara, atau review_final.

### Dampak nilai dan formula individual

- Koreksi item mengurangi nilai user, cabang, dan skor PJ sesuai aturan shift.
- User lain tidak terkena dampak jika tidak mengerjakan item tersebut.
- Penalti incident tetap dibebankan kepada reported_by.
- user_action_score = total awarded_points user / total base_points item user × 100.

### UI dan report

- Antrean review dengan filter cabang, tanggal, shift, user, status.
- Tampilkan instruksi SOP, bukti/foto, worker, base, status, final, adjustment, dan catatan.
- Sediakan Valid, Sebagian, Tidak valid, nilai koreksi, catatan wajib, dan Finalisasi review shift.
- Report provisional sampai final review.
- ScoreLedger menerima branch, PJ, action, dan incident setelah final review.
- Retry finalisasi tidak menggandakan ledger.
- Koreksi setelah finalisasi menghasilkan audit log.

### Schema review

- Tambahkan EntryReviews ke lib/schema/registry.ts, PLAN/DATABASE_SCHEMA.md, ERD, dan generator template.
- Migrasi additive untuk flat, monthly, dan yearly.
- Wajib dry-run, backup, dan audit.
- Uji satu user, banyak user, konflik, review valid/partial/invalid, live, finalisasi, koreksi, lintas cabang, dan idempotensi ledger.

## Fase 13 — Dashboard admin nilai dan detail user

### Dashboard cabang

Tampilkan weighted score, rata-rata score shift, jumlah shift selesai, total checklist, total penalti incident, tren skor, dan cabang dengan skor terendah.

### Dashboard user

Tampilkan skor PJ, skor kontribusi aksi, skor total, jumlah shift PJ, participant, cabang, checklist selesai, penalti incident, dan detail kontribusi lintas cabang.

### Detail user

Tampilkan histori: Tanggal | Cabang | Shift | Peran | Score | Penalti | Ratio PJ.

Peran: PJ, Participant, atau Pelapor incident.

### Detail report

Tampilkan skor cabang, skor PJ, kontribusi setiap user, penalti incident, rasio durasi PJ, score version, status review, dan review version.
