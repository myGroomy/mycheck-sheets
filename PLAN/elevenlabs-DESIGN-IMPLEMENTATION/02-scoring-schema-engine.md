# Schema, Scoring Engine, Report, dan Dashboard

## Fase 6 — Schema dan template scoring

### ChecklistPoints

- Tambahkan Points integer non-negatif, default 1.
- Nilai 0 berarti informasi saja.
- Data lama kosong dinormalisasi menjadi 1.

### IncidentCategories

- Pertahankan Points sebagai penalti.
- Tambahkan Penalty_Min_Severity: none, rendah, sedang, atau tinggi.
- Default none agar kategori lama tidak mendadak mengurangi skor.

### Incidents dan Reports

- Semua period mode memiliki Points_Snapshot.
- Simpan aturan efektif saat incident dibuat bila dibutuhkan audit.
- Perluas Summary_Stats dengan score_version, score_available, score_earned, incident_penalty, score_final, dan score_percent.

### Migrasi

- Update Registry, normalizer, generator XLSX, dan template snapshot.
- Buat migrasi additive untuk spreadsheet lama.
- Jalankan dry-run dan backup sebelum write.
- Jangan menghapus header lama atau fallback monthly/yearly.

## Fase 7 — Admin UI konfigurasi poin

### Checklist builder

- Input bobot per checklist point.
- Jelaskan 0 = informasi saja dan 1 = bobot normal.
- Validasi integer non-negatif, tampilkan total bobot, dan sertakan bobot pada preview shift.

### Incident builder

- Input penalty points.
- Select threshold: tidak pernah, rendah, sedang, tinggi.
- Tampilkan contoh dampak kategori.
- Validasi points, threshold, aktif/arsip, dan audit perubahan.

### Copy UI

- Tombol Preview salin konfigurasi.
- Diff dan konfirmasi replace.
- Status backup/apply/rollback yang jelas.

Acceptance: admin tidak perlu edit spreadsheet manual dan perubahan hanya berlaku pada shift baru.

## Fase 8 — Scoring engine dan shift snapshot

Saat shift dibuka, snapshot checklist point ID/label/bobot/status, incident category ID/label/penalty/threshold/status, branch ID, shift definition ID, dan score_version.

Rumus:

- available = jumlah bobot point yang berlaku.
- earned = jumlah bobot point selesai valid.
- completion_percent = earned / available * 100.
- incident_penalty = jumlah penalti incident yang memenuhi threshold.
- final_score = max(0, earned - incident_penalty).
- score_percent = final_score / available * 100.

Aturan:

- Bobot nol tidak menambah denominator.
- Skip, invalid, dan belum selesai tidak mendapat nilai.
- Hanya incident pada shift yang sama menjadi penalti.
- Penalti tidak boleh membuat skor negatif.
- Simpan komponen skor, bukan hanya persentase.

Backend:

- Buat util scoring murni dan unit-testable.
- Hitung dari snapshot, bukan konfigurasi live.
- Saat close, hitung ulang sebagai verifikasi dan simpan immutable pada report.
- Saat incident dibuat, simpan points_snapshot dan eligibility.
- Cegah perubahan score fields pada report closed.
- Audit close dan scoring version.

## Fase 9 — Report, dashboard, dan export scoring

### Report

Tampilkan available, earned, completion, penalty, final score, percent, breakdown, incident penalty, version, dan close timestamp. Bedakan skor nol dari data belum tersedia.

### Dashboard

- Filter cabang, tanggal, shift, dan status.
- Tampilkan rata-rata score, completion, total penalty, jumlah shift selesai, tren cabang/kategori, dan shift berisiko rendah.
- Hormati akses cabang; mode semua cabang menampilkan label cabang.

### Export/public report

- Sertakan komponen skor pada export yang diizinkan.
- Public token hanya melihat data yang diizinkan.
- Jangan bocorkan PIN, credential, atau spreadsheet ID internal.
