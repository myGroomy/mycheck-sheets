# Plan Implementasi UX, Branch Context, Loader, dan Scoring

Status: draft implementasi  
Tanggal: 2026-10-18

## Acuan

- `PLAN/elevenlabs-DESIGN.md`

- `PLAN/refaktor-data.md`
- `PLAN/UI-UX-AUDIT.md`
- `PLAN/add-draftshift.md`
- `lib/schema/`, `lib/store.ts`, dan helper Google Sheets

## Tujuan dan keputusan

Plan ini menyatukan perubahan landing page, dokumentasi, pemilihan cabang, copy konfigurasi, loader, dan sistem penilaian.

- Landing mengikuti struktur Stokis dengan identitas MyCheck dan palet hitam-putih.
- Admin dan petugas multi-cabang memakai global branch picker.
- Copy konfigurasi selalu preview, backup, lalu replace; data operasional tidak ikut dicopy.
- `QuantumLoader` menjadi loader halaman canonical.
- Skor memakai weighted completion dikurangi penalti incident.
- Bobot berlaku per checklist point; penalti dan threshold berlaku per kategori incident.
- Aturan scoring disnapshot saat shift dibuka dan hasil close immutable.
- Database tetap Google Sheets. Migrasi selalu additive, dry-run, backup, dan audit.

## Aturan keselamatan data

- Sumber header, nama sheet, normalisasi, dan periode tetap `lib/schema/`.
- Mode `flat` adalah default; `monthly` dan `yearly` tetap kompatibilitas.
- Jangan menghapus `PIN`, `Folder_Drive_ID`, atau fallback monthly.
- Tidak ada hard delete untuk histori operasional.
- Semua write produksi memiliki dry-run/backup dan audit log.

---

## Fase 1 — Audit dan baseline

### Pekerjaan

- Audit route landing, docs, admin, daftar shift, incident, dan report.
- Inventaris penggunaan `WorkingBranchProvider`, `CabangContext`, dan selector cabang.
- Inventaris seluruh `QuantumLoader`, `PageLoader`, skeleton, overlay, dan loader lokal.
- Audit schema `ChecklistPoints`, `IncidentCategories`, `Incidents`, `ShiftInstances`, dan `Reports`.
- Cocokkan generator XLSX dengan schema dan mode `flat`.
- Catat route yang harus menerima branch context.
- Simpan baseline build, typecheck, test, dan `git diff --check`.

### Output dan gate

- Matriks route/role, call-site loader, schema sebelum/sesudah, dan risiko migrasi.
- Tidak lanjut ke migrasi sebelum nama sheet, header, dan fallback lama terpetakan.

## Fase 2 — Landing page ElevenLabs design

### Pekerjaan

- Pertahankan struktur Stokis: hero, value proposition, alur, fitur, CTA, footer.
- Terapkan off-white canvas, near-black text, border tipis, dan grayscale.
- Gunakan display typography untuk headline dan sans-serif untuk body.
- Gunakan pill CTA dengan hierarchy primer/sekunder yang jelas.
- Tambahkan atmospheric decoration ringan dan aksesibel.
- Pastikan logo, nama app, dan deskripsi operasional terlihat di first viewport.
- Hilangkan `GlobalBackButton` pada landing yang tidak memiliki parent navigation.
- Tambahkan CTA ke `/docs` dan `/login`.

### Acceptance criteria

- Tidak ada tombol Kembali mengambang di landing.
- Tidak ada horizontal overflow pada viewport 360–564px.
- Kontras, focus state, dan `prefers-reduced-motion` aman.

## Fase 3 — Dokumentasi dan README

### Pekerjaan

- Buat `README.md` root: apa, mengapa, arsitektur, prasyarat, instalasi, environment, development, build, deployment, dan struktur data.
- Rapikan `/docs` dengan navigasi dan CTA kembali ke aplikasi.
- Lengkapi tutorial login, memilih cabang, membuka shift, checklist, handover, incident, dan close shift.
- Tambahkan panduan admin untuk user, cabang, builder, copy konfigurasi, arsip, dan rollback.
- Dokumentasikan draft local storage + spreadsheet backup dan recovery.
- Dokumentasikan scoring, rumus, snapshot, threshold incident, dan troubleshooting.
- Jangan menaruh PIN, credential, atau spreadsheet ID produksi pada contoh.

### Acceptance criteria

- Pengguna baru dapat menjalankan aplikasi dari README.
- Operasi berisiko memiliki instruksi backup/dry-run.
- Semua link docs dan route valid.

## Fase 4 — Global branch context

### Frontend

- Ubah `WorkingBranchProvider` agar berlaku untuk admin dan petugas multi-cabang.
- Validasi cabang aktif terhadap cabang yang dimiliki user.
- Simpan dan pulihkan cabang aktif melalui cookie/session yang aman.
- Tampilkan picker global di header, dengan nama cabang dan bukan spreadsheet ID.
- Tampilkan state belum memilih cabang bila user memiliki banyak cabang.
- Filter `/daftar-shift`, checklist, handover, incident, report, dan operasi shift berdasarkan cabang aktif.
- Hilangkan selector cabang duplikat dari form yang sudah memakai context global.
- Sediakan mode semua cabang hanya untuk agregasi admin yang memang memerlukannya.

### Backend

- Validasi branch context server-side terhadap akses user pada setiap endpoint.
- Terapkan filter cabang pada shift, incident, handover, report, dan dashboard.
- Jangan mempercayai `branchId` dari client tanpa authorization check.

### Acceptance criteria

- Picker konsisten untuk admin dan petugas multi-cabang.
- Refresh mempertahankan cabang aktif.
- Tidak ada kebocoran data cabang lain.

## Fase 5 — Copy konfigurasi antar-cabang

### Scope

- Shift definitions, SOP categories, checklist points, handover fields, incident categories, points, dan threshold.
- Tidak mencakup users/PIN, shift instances, entries, reports, handovers, incidents, notes, photos, audit log, draft, atau folder operasional.

### Pekerjaan

- Tambahkan endpoint preview dengan diff sumber versus target.
- Tampilkan item baru, berubah, dinonaktifkan, konflik, dan dampak replace.
- Backup target sebelum apply dan simpan backup reference.
- Apply dalam urutan relasi yang aman; regenerasi ID target.
- Arsipkan konfigurasi lama, jangan hard delete histori.
- Simpan audit actor, source, target, timestamp, item count, dan backup reference.
- Sediakan rollback dari backup.

### Acceptance criteria

- Admin melihat preview sebelum perubahan.
- Tidak ada data operasional yang ikut tercopy.
- Kegagalan dapat dipulihkan dan semua perubahan dapat diaudit.

## Fase 6 — Quantum Loader canonical

### Pekerjaan

- Tetapkan `QuantumLoader` sebagai indikator utama dan `PageLoader` sebagai wrapper page-level.
- Standarkan diameter, ketebalan ring, orbit, spacing, alignment, label, dan `role=status`.
- Migrasikan route admin checklist, report, branch, user, shift, handover, incident, dan dashboard.
- Hapus loader lokal yang redundan.
- Gunakan skeleton hanya untuk tabel/kartu yang perlu mempertahankan bentuk konten.
- Standarkan overlay, z-index, reduced motion, dan mobile footprint.

### Acceptance criteria

- Semua page loader memiliki footprint visual sama.
- Tidak ada loader “kurus” atau terlalu besar.
- Aksesibilitas dan keyboard/focus tidak terganggu.

## Fase 7 — Schema dan template scoring

### Perubahan schema

#### `ChecklistPoints`

- Tambahkan `Points`, integer non-negatif, default `1`.
- Nilai `0` berarti informasi saja.
- Data lama yang kosong dinormalisasi menjadi `1`.

#### `IncidentCategories`

- Pertahankan `Points` sebagai penalti.
- Tambahkan `Penalty_Min_Severity`: `none`, `rendah`, `sedang`, atau `tinggi`.
- Default `none` agar kategori lama tidak mendadak mengurangi skor.

#### `Incidents`

- Pastikan semua period mode memiliki `Points_Snapshot`.
- Simpan aturan efektif yang digunakan saat incident dibuat jika dibutuhkan audit.

#### `Reports`

- Perluas `Summary_Stats` dengan `score_version`, `score_available`, `score_earned`, `incident_penalty`, `score_final`, dan `score_percent`.

### Migrasi

- Update registry, normalizer, generator XLSX, dan template snapshot.
- Buat migrasi additive untuk spreadsheet lama.
- Jalankan dry-run dan backup sebelum write.
- Jangan menghapus header lama atau fallback monthly/yearly.

## Fase 8 — Admin UI konfigurasi poin

### Checklist builder

- Tambahkan input bobot per checklist point.
- Jelaskan `0 = informasi saja`, `1 = bobot normal`.
- Validasi integer non-negatif dan tampilkan total bobot.
- Sertakan bobot pada preview shift.

### Incident category builder

- Tambahkan input penalty points.
- Tambahkan select threshold severity: tidak pernah, rendah, sedang, tinggi.
- Tampilkan contoh dampak kategori.
- Validasi points, threshold, aktif/arsip, dan audit perubahan.

### Copy UI

- Tombol `Preview salin konfigurasi`.
- Diff dan konfirmasi replace.
- Status backup/apply/rollback yang jelas.

### Acceptance criteria

- Admin tidak perlu mengedit spreadsheet manual.
- Perubahan berlaku pada shift baru, bukan shift yang sudah berjalan.

## Fase 9 — Scoring engine dan shift snapshot

### Snapshot

Saat shift dibuka, simpan checklist point ID/label/bobot/status, incident category ID/label/penalty/threshold/status, branch ID, shift definition ID, dan `score_version`.

### Rumus

```text
available = jumlah bobot point yang berlaku
earned = jumlah bobot point yang selesai valid
completion_percent = earned / available * 100
incident_penalty = jumlah penalti incident yang memenuhi threshold
final_score = max(0, earned - incident_penalty)
score_percent = final_score / available * 100
```

- Bobot nol tidak menambah denominator.
- Skip, invalid, dan belum selesai tidak mendapat nilai.
- Hanya incident pada shift yang sama yang menjadi penalti.
- Penalti tidak boleh membuat skor negatif.
- Simpan komponen skor, bukan hanya persentase.

### Backend

- Buat util scoring murni dan unit-testable.
- Hitung berdasarkan snapshot, bukan konfigurasi live.
- Saat close, hitung ulang sebagai verifikasi dan simpan hasil immutable pada report.
- Saat incident dibuat, simpan `points_snapshot` dan eligibility.
- Cegah perubahan score fields pada report closed.
- Audit close dan scoring version.

## Fase 10 — Report dan dashboard scoring

### Report

- Tampilkan available, earned, completion, penalty, final score, percent, breakdown, incident penalti, version, dan close timestamp.
- Bedakan skor nol dari data belum tersedia.

### Dashboard

- Filter cabang, tanggal, shift, dan status.
- Tampilkan rata-rata score, completion, total penalty, jumlah shift selesai, tren cabang/kategori, dan shift berisiko rendah.
- Hormati akses cabang; mode semua cabang harus menampilkan label cabang.

### Export/public report

- Sertakan komponen skor pada export yang diizinkan.
- Public token hanya melihat data yang diizinkan.
- Jangan bocorkan PIN, credential, atau spreadsheet ID internal.

## Fase 11 — Dokumentasi operasional

- Dokumentasikan pemilihan cabang admin/petugas.
- Dokumentasikan preview, backup, apply, rollback copy config.
- Dokumentasikan bobot, threshold, rumus, snapshot, dan contoh perhitungan.
- Dokumentasikan bahwa konfigurasi baru hanya berlaku pada shift baru.
- Tambahkan FAQ shift tanpa bobot, incident tanpa shift, dan recovery spreadsheet.

## Fase 12 — Test, dry-run, dan rollout

### Test

- Unit: normalizer bobot, threshold, weighted completion, bobot nol, penalti tunggal/ganda, penalti melebihi skor, incident di luar shift, snapshot immutable.
- API: authorization branch, filtering seluruh endpoint, preview/backup/apply/rollback, close shift, dan backward compatibility.
- UI: viewport 360/390/564px, landing CTA, picker, shift filter, form points, loader, keyboard, aria, reduced motion.

### Dry-run dan rollout

1. Export schema/header dan backup spreadsheet.
2. Jalankan migrasi additive dalam dry-run.
3. Verifikasi row/header dan review preview copy.
4. Deploy compatibility schema dan snapshot.
5. Aktifkan admin points/threshold.
6. Aktifkan scoring untuk shift baru.
7. Aktifkan dashboard/export dan monitor audit/error.

### Rollback

- Matikan feature flag scoring tanpa menghapus kolom.
- Kembalikan report ke fallback tanpa score.
- Restore konfigurasi dari backup bila apply gagal.
- Jangan menghapus incident, report, snapshot, atau histori.

## Definition of Done

- [ ] Landing mengikuti design plan dan stabil di mobile.
- [ ] Docs dan README lengkap serta memiliki CTA aplikasi.
- [ ] Branch picker global berlaku untuk admin dan petugas multi-cabang.
- [ ] Copy config memiliki preview, backup, audit, dan rollback.
- [ ] Quantum Loader canonical konsisten.
- [ ] Schema/template memiliki bobot, threshold, dan snapshot.
- [ ] Admin dapat mengatur poin tanpa edit spreadsheet manual.
- [ ] Scoring weighted completion + incident penalty teruji.
- [ ] Score immutable tersimpan saat close shift.
- [ ] Report dan dashboard menampilkan breakdown skor.
- [ ] Migrasi production telah dry-run, backup, dan diaudit.
- [ ] Build, typecheck, lint, unit, integration, dan smoke test lulus.

---

# Plan Penilaian Cabang dan User Lintas Cabang

## Ringkasan

  MyCheck akan memiliki tiga jenis nilai:

1. Nilai cabang — performa operasional setiap cabang.
2. Nilai PJ user — kualitas user saat memimpin shift.
3. Nilai kontribusi user — checklist yang berhasil diselesaikan user, meskipun

   bekerja di cabang berbeda.

   Nilai user tersimpan menggunakan User\_ID global sehingga tetap terakumulasi ketika

   user berpindah-pindah cabang.
   ## Perubahan Arsitektur
   ### 1. Shift dan atribusi PJ

   Tambahkan sheet cabang ShiftPjAssignments:

   id

   shift\_instance\_id

   user\_id

   started\_at

   ended\_at

   is\_current

   source

   created\_at

   Alur:
   - Saat shift dibuka, buat assignment PJ pertama.
   - Saat admin mengganti PJ, tutup assignment lama dengan ended\_at.
   - Buat assignment baru untuk PJ berikutnya.
   - Saat shift ditutup, hitung proporsi waktu setiap PJ.
   - Nilai kepemimpinan shift dibagi berdasarkan durasi masing-masing PJ.

   Contoh:

   PJ A memimpin 4 jam dari total 8 jam = 50% nilai PJ

   PJ B memimpin 4 jam dari total 8 jam = 50% nilai PJ

   Untuk shift lama tanpa histori pergantian PJ, gunakan pj\_user\_id sebagai pemilik

   penuh dengan rasio 1.0.
   ### 2. Nilai cabang

   Nilai cabang dihitung dari semua shift selesai pada cabang tersebut.

   Per shift:

   branch\_earned = checklist\_earned - incident\_penalty

   branch\_available = total\_checklist\_weight

   branch\_score = max(0, branch\_earned) / branch\_available \* 100

   Dashboard menampilkan dua agregasi:
   - Weighted aggregate: total earned seluruh shift dibagi total available.
   - Rata-rata shift: rata-rata persentase setiap shift.

   Nilai cabang tetap melekat pada branch\_id, sehingga tidak terpengaruh user yang

   bertugas.
   ### 3. Nilai user sebagai PJ

   Nilai PJ user berasal dari skor final shift yang ia pimpin.

   user\_pj\_earned = shift\_final\_score × pj\_time\_ratio

   user\_pj\_available = shift\_available × pj\_time\_ratio

   user\_pj\_score = user\_pj\_earned / user\_pj\_available × 100

   Jika terdapat pergantian PJ, setiap user hanya menerima bagian sesuai durasi

   kepemimpinannya.
   ### 4. Nilai kontribusi aksi user

   Setiap checklist yang berhasil diselesaikan memiliki completed\_by.

   Nilai kontribusi user dihitung lintas cabang:

   action\_earned = total bobot checklist yang dimenangkan user

   action\_available = total bobot checklist pada shift terkait

   action\_score = action\_earned / action\_available × 100

   Setiap checklist hanya dapat dimenangkan satu user berdasarkan mekanisme

   concurrency yang sudah ada.

   Data sumber:
   - Entries.completed\_by
   - Entries.state
   - SnapshotPoint.points
   - Participants.user\_id
   ### 5. Penalti incident user

   Karena keputusan produk memilih penalti kepada pelapor:
   - Penalti cabang masuk ke skor cabang.
   - Penalti PJ masuk ke skor kepemimpinan berdasarkan rasio PJ.
   - Penalti user masuk ke user yang tercatat pada Incidents.reported\_by.
   - Incident di luar shift tidak mengurangi skor shift.
   - Penalti disimpan sebagai snapshot dan tidak berubah ketika kategori incident

   diedit.
   ## Sheet Score Ledger

   Tambahkan sheet terpusat pada Registry, misalnya ScoreLedger.

   Header:

   id

   scope\_type

   subject\_id

   branch\_id

   shift\_instance\_id

   report\_id

   metric\_type

   score\_version

   points\_available

   points\_earned

   incident\_penalty

   final\_points

   score\_percent

   attribution\_ratio

   calculated\_at

   created\_at

   Nilai:
   - scope\_type: branch atau user
   - metric\_type: branch, pj, action, incident
   - subject\_id:
     - branch ID untuk nilai cabang
     - user ID untuk nilai user
   - attribution\_ratio: rasio waktu PJ atau 1 untuk branch/action
   - report\_id: sumber immutable per shift

   Penulisan ledger harus idempoten menggunakan kombinasi:

   report\_id + scope\_type + subject\_id + metric\_type + score\_version

   Jika proses close diulang, sistem tidak boleh menggandakan nilai.
   ## Skor Total User

   Dashboard user menampilkan tiga nilai:
4. Skor PJ
5. Skor kontribusi aksi
6. Skor total

   Formula default:

   user\_total\_score =

   (user\_pj\_score × 50%) +

   (user\_action\_score × 50%)

   Jika user belum pernah menjadi PJ atau belum pernah menyelesaikan checklist:
   - Metrik tersebut ditampilkan sebagai Belum tersedia.
   - Skor total hanya dihitung dari metrik yang sudah memiliki data.
   - Jumlah shift PJ, jumlah shift kontribusi, dan jumlah cabang tetap ditampilkan

   sebagai konteks.
   ## Perubahan API

   Tambahkan atau perluas endpoint:
   - GET /api/admin/scores/branches
   - GET /api/admin/scores/users
   - GET /api/admin/scores/users/\[id\]
   - GET /api/admin/scores/branches/\[id\]
   - GET /api/reports/\[id\] untuk mengembalikan breakdown skor.
   - Endpoint close shift untuk menghasilkan ledger secara idempoten.
   - Endpoint pergantian PJ untuk mencatat ShiftPjAssignments.

   Filter dashboard:

   branchId

   userId

   dateFrom

   dateTo

   shiftDefinitionId

   metricType

   Semua endpoint wajib memvalidasi akses cabang server-side.
   ## Perubahan UI Admin
   ### Dashboard nilai cabang

   Tampilkan:
   - weighted score
   - rata-rata score shift
   - jumlah shift selesai
   - total checklist
   - total penalti incident
   - tren skor
   - cabang dengan skor terendah
   ### Dashboard nilai user

   Tampilkan:
   - skor PJ
   - skor kontribusi aksi
   - skor total
   - jumlah shift sebagai PJ
   - jumlah shift sebagai participant
   - jumlah cabang
   - total checklist selesai
   - total penalti incident
   - detail kontribusi lintas cabang
   ### Detail user

   Tampilkan histori:

   Tanggal | Cabang | Shift | Peran | Score | Penalti | Ratio PJ

   Peran dapat berupa:
   - PJ
   - Participant
   - Pelapor incident
   ### Detail report

   Tambahkan breakdown:
   - skor cabang
   - skor PJ
   - kontribusi setiap user
   - penalti incident
   - rasio durasi PJ
   - score version
   ## Perubahan Schema

   Update:
   - lib/schema/registry.ts
   - PLAN/DATABASE\_[SCHEMA.md](http://SCHEMA.md)
   - PLAN/[ERD.md](http://ERD.md)
   - generator template XLSX
   - snapshot type dan builder
   - report summary schema

   Tambahan utama:
   - ChecklistPoints.points
   - IncidentCategories.penalty\_min\_severity
   - Incidents.points\_snapshot
   - Reports.summary\_stats scoring fields
   - ShiftPjAssignments
   - ScoreLedger pada Registry

   Schema baru harus additive dan tetap mendukung:
   - template flat
   - cabang monthly
   - cabang yearly
   - report lama tanpa scoring
   - shift lama tanpa assignment history
   ## Urutan Implementasi
   ### Fase 1 — Data model dan migration
   - Finalisasi header baru.
   - Tambahkan ShiftPjAssignments.
   - Tambahkan ScoreLedger.
   - Update normalizer dan registry.
   - Update generator template.
   - Buat migrasi dry-run dan backup.
   ### Fase 2 — PJ assignment tracking
   - Catat assignment saat shift dibuka.
   - Catat pergantian PJ.
   - Tutup assignment aktif saat shift selesai.
   - Tambahkan fallback untuk shift lama.
   ### Fase 3 — Scoring engine
   - Buat fungsi scoring murni.
   - Hitung skor cabang.
   - Hitung skor PJ berdasarkan rasio waktu.
   - Hitung kontribusi user berdasarkan completed\_by.
   ### Fase 4 — Ledger writer
   - Simpan score version dan source report.
   - Tambahkan audit log.
   - Sediakan rebuild ledger dari report untuk recovery.
   ### Fase 5 — API dan dashboard
   - Buat API agregasi cabang dan user.
   - Tambahkan filter lintas cabang.
   - Tambahkan halaman detail user.
   - Tambahkan breakdown pada report.
   - Tambahkan export score jika aman.
   ### Fase 6 — Testing dan rollout
   - Test shift tanpa pergantian PJ.
   - Test shift dengan dua PJ.
   - Test PJ berganti beberapa kali.
   - Jalankan migrasi production melalui dry-run, backup, dan audit.
   ## Acceptance Criteria
   - User yang berpindah cabang tetap memiliki satu histori nilai berdasarkan

   User\_ID.
   - Nilai cabang tidak berpindah ketika PJ atau participant berganti.
   - Pergantian PJ membagi nilai secara proporsional terhadap durasi.
   - Nilai kontribusi menggunakan user yang tercatat pada completed\_by.
   - Penalti incident user menggunakan reported\_by.
   - Report closed tidak berubah karena konfigurasi scoring baru.
   - Ledger dapat dibangun ulang dari report.
   - Tidak ada duplikasi skor ketika close diulang.
   - Dashboard dapat menampilkan skor cabang dan user secara terpisah.
   - Data lama tetap dapat dibuka tanpa error.



---

## Addendum: Fase 13 — Review Checklist dan Penilaian Individual

### Tujuan

Memungkinkan satu shift dikerjakan beberapa petugas, mencatat user yang menyelesaikan setiap item, lalu memberi admin kemampuan melakukan review dan koreksi nilai per item.

### Model shift kolaboratif

- Satu shift dapat memiliki satu PJ dan banyak participant.
- Setiap checklist item memiliki satu user utama melalui `Entries.completed_by`.
- Jika dua user mencoba item yang sama, mekanisme concurrency tetap menentukan satu pemenang.
- Jika hanya satu user yang bekerja, seluruh item yang diselesaikan tercatat kepada user tersebut.
- `Participants` tetap menjadi daftar user yang mengikuti shift.

### Sheet `EntryReviews`

Tambahkan sheet periodik dengan header:

```text
id
shift_instance_id
entry_id
point_ref
worker_user_id
review_status
base_points
awarded_points
points_adjustment
review_note
reviewed_by
reviewed_at
review_stage
version
created_at
```

Nilai `review_status`: `pending`, `valid`, `partial`, atau `invalid`.

Nilai `review_stage`: `live` atau `final`.

`worker_user_id` disalin dari `Entries.completed_by` dan tidak boleh diubah reviewer.

### Aturan review dan nilai

- Sebelum review, item selesai memakai `base_points`.
- `valid` memberikan seluruh `base_points`.
- `partial` memakai `awarded_points` yang dipilih admin.
- `invalid` memberikan nilai `0`.
- `awarded_points` dibatasi antara `0` dan `base_points`.
- `points_adjustment = awarded_points - base_points`.
- Catatan wajib jika nilai akhir berbeda dari nilai dasar.
- Review live bersifat provisional dan dapat diperbarui.
- Review final menjadi sumber nilai resmi setelah shift ditutup.

### Tahapan review

1. Saat shift berjalan, admin dapat meninjau item secara live.
2. Saat shift ditutup, item yang belum direview masuk antrean review final.
3. Admin mengonfirmasi status dan nilai setiap item.
4. Admin melakukan finalisasi review shift.
5. Setelah finalisasi, perubahan hanya boleh dilakukan melalui koreksi ter-audit.

Status review shift: `belum_direview`, `review_sementara`, atau `review_final`.

### Formula penilaian individual

```text
user_action_score =
  total awarded_points user /
  total base_points item yang dikerjakan user × 100
```

Penilaian user terdiri dari skor PJ berdasarkan rasio durasi kepemimpinan, skor kontribusi berdasarkan `completed_by`, dan penalti incident berdasarkan `reported_by`.

```text
user_total_score = (user_pj_score × 50%) + (user_action_score × 50%)
```

Jika salah satu dimensi belum tersedia, tampilkan `Belum tersedia`, bukan nilai nol.

### Dampak ke skor cabang dan PJ

- Koreksi item mengurangi nilai user yang mengerjakannya.
- Koreksi item juga mengurangi nilai cabang.
- Koreksi item masuk ke skor PJ shift sesuai aturan scoring shift.
- User lain tidak terkena dampak jika tidak mengerjakan item tersebut.
- Penalti incident user dibebankan kepada user pada `reported_by`.

### Report dan ledger

- Report shift berstatus provisional sampai review final selesai.
- Report menampilkan item, worker, nilai dasar, status review, nilai akhir, adjustment, dan catatan admin.
- `ScoreLedger` menerima record branch, PJ, action, dan incident setelah review final.
- Deduplication key memakai `report_id`, subject, metric, dan versi review.
- Retry finalisasi tidak boleh menggandakan ledger.
- Koreksi setelah finalisasi wajib menghasilkan audit log.

### UI admin

- Tambahkan antrean review dengan filter cabang, tanggal, shift, user, dan status.
- Tampilkan instruksi SOP, bukti/foto, user pelaksana, nilai dasar, dan nilai final.
- Sediakan pilihan `Valid`, `Sebagian`, dan `Tidak valid`.
- Sediakan input nilai koreksi dan catatan wajib.
- Tambahkan tombol `Finalisasi review shift`.
- Tampilkan breakdown kontribusi setiap user pada detail report.

### Schema, migrasi, dan test

- Tambahkan `EntryReviews` ke `lib/schema/registry.ts`, `PLAN/DATABASE_SCHEMA.md`, ERD, dan generator template.
- Gunakan migrasi additive untuk `flat`, `monthly`, dan `yearly`.
- Item lama tanpa review memakai nilai otomatis dari `Entries`.
- Jangan mengubah histori `Entries`; review disimpan sebagai record/version baru.
- Migrasi wajib dry-run, backup, dan audit.
- Uji satu user, banyak user, konflik item, review valid/partial/invalid, perubahan live, finalisasi, koreksi ter-audit, lintas cabang, dan idempotensi ledger.