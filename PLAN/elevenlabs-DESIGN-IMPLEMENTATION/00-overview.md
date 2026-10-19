# Overview Implementasi

Status: draft implementasi
Tanggal: 2026-10-18
Pemutakhiran: 2026-10-19

## Tujuan dan keputusan

- Landing mengikuti struktur Stokis dengan identitas MyCheck dan palet hitam-putih.
- Admin dan petugas multi-cabang memakai global branch picker.
- Copy konfigurasi selalu preview, backup, replace, audit, dan rollback; data operasional tidak ikut dicopy.
- QuantumLoader menjadi loader canonical dengan footprint konsisten.
- Scoring memakai weighted completion dikurangi penalti incident.
- Bobot berlaku per checklist point; penalti dan threshold berlaku per kategori incident.
- Scoring disnapshot saat shift dibuka; close dan review final immutable kecuali koreksi ter-audit.
- Satu shift dapat dikerjakan banyak petugas; setiap item memiliki Entries.completed_by.
- Nilai cabang melekat pada branch_id; nilai user melekat pada User_ID global lintas cabang.
- Database tetap Google Sheets; migrasi selalu additive, dry-run, backup, dan audit.

## Aturan keselamatan data

- Sumber header, nama sheet, normalisasi, dan periode tetap lib/schema/.
- Mode flat adalah default; monthly dan yearly tetap kompatibilitas.
- Jangan menghapus PIN, Folder_Drive_ID, fallback monthly, atau histori operasional.
- Tidak ada hard delete untuk histori shift, entry, report, handover, incident, foto, audit, review, atau ledger.
- Write produksi wajib memiliki dry-run/backup dan audit log.
- Jangan menaruh PIN, credential, spreadsheet ID produksi, atau token internal di contoh.

## Urutan workstream

1. Audit dan baseline.
2. Landing page dan dokumentasi.
3. Global branch context.
4. Copy konfigurasi antar-cabang.
5. Quantum Loader canonical.
6. Schema/template scoring.
7. Admin scoring configuration.
8. Scoring engine dan snapshot.
9. Report, dashboard, dan export scoring.
10. Nilai cabang, PJ, dan user lintas cabang.
11. Review checklist individual.
12. Notifikasi, shareable report, PDF, warna section, dan UX polish.
13. Testing, dry-run, rollout, dan rollback.

## Fase 1 — Audit dan baseline

- Audit route landing, docs, admin, daftar shift, incident, report, handover, dan pengaturan.
- Inventaris WorkingBranchProvider, CabangContext, selector cabang, dan query branchId.
- Inventaris QuantumLoader, PageLoader, skeleton, overlay, dan loader lokal.
- Audit schema ChecklistPoints, IncidentCategories, Incidents, ShiftInstances, Entries, Reports, Participants, dan Registry.
- Cocokkan generator XLSX dengan schema dan mode flat.
- Catat route yang wajib menerima branch context.
- Audit component redundant pada header, selector, loader, modal, notification, badge, card, form, dan action bar.
- Simpan baseline build, typecheck, test, lint, dan git diff --check.

Output: matriks route/role/cabang, call-site loader, component redundancy map, schema sebelum/sesudah, dan risiko migrasi.

## Gate lintas dokumen

- Fase schema tidak boleh menghapus header lama atau fallback monthly/yearly.
- Fase UI tidak boleh mengandalkan field yang belum lolos migrasi.
- Fase scoring harus memakai snapshot, bukan konfigurasi live.
- Fase rollout harus memiliki backup, dry-run, audit, dan rollback.
