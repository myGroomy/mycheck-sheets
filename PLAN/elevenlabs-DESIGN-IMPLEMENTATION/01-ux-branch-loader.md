# UX, Branch Context, Dokumentasi, dan Loader

## Fase 2 — Landing page dan dokumentasi

### Landing

- Pertahankan struktur Stokis: hero, value proposition, alur, fitur, CTA, footer.
- Terapkan off-white canvas, near-black text, border tipis, grayscale, display typography, sans-serif body, dan pill CTA.
- Tambahkan atmospheric decoration ringan dan aksesibel.
- Pastikan logo, nama app, dan deskripsi operasional terlihat di first viewport.
- Hilangkan GlobalBackButton pada landing tanpa parent navigation.
- Tambahkan CTA ke /docs dan /login.

### README dan docs

- Buat README.md root: apa, mengapa, arsitektur, prasyarat, instalasi, environment, development, build, deployment, dan struktur data.
- Rapikan /docs dengan navigasi dan CTA kembali ke aplikasi.
- Lengkapi tutorial login, memilih cabang, membuka shift, checklist, handover, incident, close shift, draft, sinkronisasi, dan recovery.
- Tambahkan panduan admin untuk user, cabang, builder, copy konfigurasi, arsip, backup, rollback, poin, threshold, review, dan scoring.
- Dokumentasikan rumus, snapshot, threshold incident, shareable report, export PDF, dan troubleshooting.
- Jangan menaruh PIN, credential, atau spreadsheet ID produksi.

Acceptance:

- Tidak ada tombol Kembali mengambang atau horizontal overflow pada viewport 360–564px.
- Kontras, focus, keyboard, dan prefers-reduced-motion aman.
- Pengguna baru dapat menjalankan aplikasi dari README.
- Semua link docs dan route valid.
- Operasi berisiko memiliki instruksi backup/dry-run.

## Fase 3 — Global branch context

### Frontend

- WorkingBranchProvider berlaku untuk admin dan petugas multi-cabang.
- Validasi cabang aktif, simpan/pulihkan melalui cookie/session aman, dan tampilkan picker global dengan nama cabang, bukan spreadsheet ID.
- Tampilkan state belum memilih cabang untuk user dengan banyak cabang.
- Filter daftar shift, checklist, handover, incident, report, dashboard, dan operasi shift.
- Hilangkan selector duplikat dari form yang sudah memakai context global.
- Sediakan mode semua cabang hanya untuk agregasi admin.

### Backend

- Validasi branch context server-side pada setiap endpoint.
- Terapkan filter cabang pada shift, incident, handover, report, dashboard, score, review, dan notification.
- Jangan percaya branchId dari client tanpa authorization check.

Acceptance: picker konsisten untuk admin/petugas, refresh mempertahankan cabang, dan tidak ada kebocoran data cabang lain.

## Fase 4 — Copy konfigurasi antar-cabang

Scope copy: shift definitions, SOP categories, checklist points dan bobot, handover fields, incident categories, points, dan threshold.

Jangan copy users/PIN, shift instances, entries, participants, reports, handovers, incidents, notes, photos, audit log, draft, score ledger, review, atau folder operasional.

- Tambahkan endpoint preview dengan diff sumber-target.
- Tampilkan item baru, berubah, dinonaktifkan, konflik, dan dampak replace.
- Backup target sebelum apply dan simpan backup reference.
- Apply dalam urutan relasi aman dan regenerasi ID target.
- Arsipkan konfigurasi lama, jangan hard delete histori.
- Simpan actor, source, target, timestamp, item count, dan backup reference.
- Sediakan rollback dari backup.

Acceptance: admin melihat preview, data operasional tidak tercopy, kegagalan dapat dipulihkan, dan perubahan diaudit.

## Fase 5 — Quantum Loader canonical

- Tetapkan QuantumLoader sebagai indikator utama dan PageLoader sebagai wrapper page-level.
- Standarkan diameter, ketebalan ring, orbit, spacing, alignment, label, role=status, overlay, z-index, reduced motion, dan mobile footprint.
- Migrasikan route admin checklist, report, branch, user, shift, handover, incident, dashboard, dan pengaturan.
- Hapus loader lokal redundan.
- Gunakan skeleton hanya untuk tabel/kartu yang mempertahankan bentuk konten.

Acceptance: footprint seluruh loader sama, tidak ada loader kurus/besar, dan aksesibilitas keyboard/focus aman.
