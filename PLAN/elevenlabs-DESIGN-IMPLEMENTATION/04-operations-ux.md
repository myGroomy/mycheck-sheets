# Notifikasi, Report, PDF, Warna, Settings, dan Cleanup

## Fase 14 — Notifikasi dan sinkronisasi operasional

- Notifikasi status sinkronisasi: berhasil, tertunda, gagal, atau tersinkron ulang.
- Tampilkan event dari header, misalnya Buka/tutup toko dilakukan oleh X dan X mengisi item A.
- Simpan actor, branch, shift, jenis event, object, timestamp, status, dan link tujuan.
- Hormati akses cabang, state read/unread, dan deep-link ke shift, item, incident, atau report.
- Hindari duplikasi notifikasi saat retry.
- Tambahkan loading line/progress pada preview, backup, copy, sync, close, finalisasi review, export, dan PDF.

## Fase 15 — Shareable report dan PDF

### Shareable report

- Semua petugas yang berhak dapat membuat/membuka link sesuai policy.
- Link menampilkan checklist, handover, incident, score, review, dan metadata yang diizinkan.
- Public token hanya membuka scope yang diberikan.
- Audit create, access, revoke, dan expiry.

### PDF

- Output harus berupa kertas laporan formal, bukan screenshot halaman.
- Layout khusus: header app/cabang/shift, tanggal, PJ, checklist terkelompok, handover, incident, foto/evidence, scoring, review, ringkasan, footer halaman.
- Dukung print dan save PDF dengan page break, margin, typography, kontras, tabel tidak terpotong, dan timestamp.
- Uji mobile preview, desktop print, A4/Letter, dan report panjang.

## Fase 16 — Warna section dan atribusi item

- Builder dapat mengatur warna setiap section/category.
- Simpan warna dalam konfigurasi dan snapshot shift.
- Validasi warna, kontras, fallback grayscale, print, dan reduced motion.
- Item yang dikerjakan user lain menampilkan badge berwarna yang jelas dan memuat nama user.
- Badge terbaca di mobile, dark/light surface, report, PDF, dan screen reader.

## Fase 17 — Pengaturan dan component cleanup

- Audit semua fitur pengaturan yang belum berfungsi.
- Setiap setting memiliki loading, success, error, disabled, dan konfirmasi bila berdampak data.
- Setting yang belum didukung backend diberi disabled state dan penjelasan, bukan tombol palsu.
- Audit component redundant di header, selector, loader, modal, notification, badge, card, form, dan action bar.
- Satukan komponen dengan behavior/style/accessibility contract sama.
- Jangan mengubah kontrak API, role guard, atau layout mobile.
