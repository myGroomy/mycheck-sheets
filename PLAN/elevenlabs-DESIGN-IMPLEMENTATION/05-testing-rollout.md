# Schema Final, Testing, Rollout, dan Definition of Done

## Fase 18 — Schema, API, dan generator final

Update:

- lib/schema/registry.ts.
- PLAN/DATABASE_SCHEMA.md dan ERD.
- Generator template XLSX.
- Snapshot type dan builder.
- Report summary schema.
- ShiftPjAssignments, ScoreLedger, dan EntryReviews.
- Endpoint scoring, PJ assignment, review, report, share, notification, PDF, dan settings.

Schema additive harus tetap mendukung:

- Template flat.
- Cabang monthly.
- Cabang yearly.
- Report lama tanpa scoring.
- Shift lama tanpa assignment.
- Entry lama tanpa review.
- Konfigurasi lama tanpa warna.

## Fase 19 — Testing, dry-run, rollout, dan rollback

### Unit dan integration

- Normalizer bobot, threshold, warna, dan legacy defaults.
- Weighted completion, bobot nol, penalti tunggal/ganda, penalti melebihi skor, incident luar shift, dan snapshot immutable.
- PJ tanpa pergantian, dua PJ, pergantian berkali-kali, dan rasio waktu.
- completed_by, reported_by, cross-branch aggregation, dan User_ID global.
- Review valid/partial/invalid, adjustment, catatan, live/final, koreksi, dan ledger idempotent.
- Authorization branch, filter endpoint, preview/backup/apply/rollback, close, share token, notifications, dan backward compatibility.
- Batch flush, retry, lock, Redis outage, fallback Sheets, dan duplicate action.

### UI dan smoke

- Viewport 360/390/564px.
- Landing CTA, README/docs, picker, shift filter, points form, review queue, loader, notification, worker badge, settings, PDF, keyboard, aria, dan reduced motion.
- Petugas membuka shareable report sesuai akses.
- Report panjang tercetak ke A4/Letter tanpa section terpotong.

### Rollout

1. Export schema/header dan backup spreadsheet.
2. Jalankan migrasi additive dalam dry-run.
3. Verifikasi row/header dan review preview copy.
4. Deploy compatibility schema dan snapshot.
5. Aktifkan points, threshold, warna, dan review.
6. Aktifkan scoring untuk shift baru.
7. Aktifkan dashboard, export, notification, share, dan PDF.
8. Monitor audit, error, quota Sheets, sync failure, dan duplicate ledger.

### Rollback

- Matikan feature flag scoring tanpa menghapus kolom.
- Kembalikan report ke fallback tanpa score.
- Restore konfigurasi dari backup bila apply gagal.
- Nonaktifkan review final tanpa menghapus EntryReviews.
- Nonaktifkan notification/share/PDF tanpa menghapus histori.
- Jangan menghapus incident, report, snapshot, review, ledger, atau histori.

## Definition of Done

- [ ] Landing sesuai design plan dan stabil di mobile.
- [ ] README/docs lengkap serta memiliki CTA aplikasi.
- [ ] Branch picker global berlaku untuk admin dan petugas multi-cabang.
- [ ] Copy config memiliki preview, backup, audit, dan rollback.
- [ ] Quantum Loader canonical konsisten.
- [ ] Schema/template memiliki bobot, threshold, warna, snapshot, assignment, review, dan ledger.
- [ ] Admin mengatur poin tanpa edit spreadsheet manual.
- [ ] Weighted completion + incident penalty teruji.
- [ ] Score immutable tersimpan saat close/review final.
- [ ] Report/dashboard menampilkan breakdown cabang dan user.
- [ ] Satu shift mendukung banyak user dengan atribusi item jelas.
- [ ] Review mendukung valid, partial, invalid, live, final, dan koreksi.
- [ ] Notifikasi sync, progress action, shareable report, dan PDF formal berfungsi.
- [ ] Warna section/category dan badge worker konsisten serta accessible.
- [ ] Pengaturan berfungsi atau memiliki disabled state yang jelas.
- [ ] Component redundant diaudit tanpa regresi.
- [ ] Migrasi production telah dry-run, backup, dan diaudit.
- [ ] Build, typecheck, lint, unit, integration, dan smoke test lulus.
