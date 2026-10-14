# Penilaian Kemudahan MyCheck

**Dasar penilaian:** inspeksi implementasi aktif pada 14 Oktober 2026, bukan
hasil usability test. Nilai memperkirakan kemudahan alur UI/API dan friksi
yang terlihat; tidak mengukur waktu tugas atau kepuasan pengguna nyata.

## Ringkasan nilai

| Aspek | Nilai | Dasar |
|---|---:|---|
| Penggunaan Petugas | **3,5/5** | Tugas rutin berpusat pada daftar shift dan checklist kolaboratif. Friksi muncul saat menjadi PJ, memenuhi prasyarat penutupan, menangani konflik, atau bekerja dengan koneksi buruk. |
| Penggunaan Admin | **2,5/5** | Kemampuan tersedia luas, tetapi tersebar di halaman konfigurasi, operasi, akun, incident, laporan, pengaturan, dan audit. Aksi pengecualian berisiko tinggi memerlukan pemahaman dampak. |
| Penggunaan keseluruhan | **3/5** | Nilai gabungan indikatif; pengalaman Petugas dan Admin berbeda sehingga lebih berguna dinilai terpisah. |
| Pengembangan oleh developer | **3/5** | Struktur Next.js/TypeScript dan pemisahan route/UI/helper cukup mudah ditelusuri; keterbatasan Sheets, tidak adanya test runner, dan validasi/API yang beragam menambah biaya perubahan. |

Nilai per peran memakai setengah poin agar perbedaan friksi terlihat; semuanya
tetap estimasi inspeksi. Skala: **1** sangat sulit, **2** sulit, **3** cukup
dengan friksi, **4** mudah dengan sedikit friksi, **5** sangat mudah dan telah
tervalidasi dengan pengguna sasaran.

## Kesetaraan fitur menurut perangkat

**Kesimpulan dari source:** tidak tampak fitur bisnis yang sengaja hanya dapat
dipakai di desktop atau hanya di mobile. Halaman dan route yang sama dirender
secara responsif. Yang berbeda terutama cara menemukan menu dan penyajian
daftar; kesamaan kode/route ini belum membuktikan setiap alur sudah nyaman atau
berhasil pada semua browser dan ukuran layar.

| Area | Desktop/tablet lebar | Mobile/tablet kecil | Perbedaan akses fitur |
|---|---|---|---|
| Petugas: Checklist, Incident, Laporan | Menu header dan navigasi halaman; beranda petugas juga punya header dengan drawer. | Bar bawah untuk Checklist/Incident/Laporan; Panduan dan Ganti PIN melalui menu **Lainnya**. | Tidak ada perbedaan fungsi bisnis yang terlihat; jalur navigasi dan posisi kontrol berbeda. |
| Admin: Dashboard, Operasi, Incident, Laporan | Sidebar berkelompok di area `/admin`; semua kelompok konfigurasi dan administrasi terlihat. | Empat item utama pada bar bawah; Cabang, Shift, Checklist/SOP, Handover, Akun, Pengaturan, Audit Log ada di drawer **Lainnya**. | Fitur tersedia melalui halaman yang sama, tetapi beberapa menu memerlukan satu langkah tambahan di mobile. |
| Admin: daftar data | Beberapa halaman memakai `ResponsiveRecordCards` untuk menampilkan kartu di bawah breakpoint `md` dan tabel pada viewport lebih besar. | Kartu berisi field, status, detail dan aksi pada halaman yang memakai komponen itu. | Adaptasi hanya terjadi di halaman yang menggunakannya; tidak berarti semua tabel/kolom sudah dioptimalkan untuk layar sempit. |
| Pengisian form, checklist, handover, tindakan admin | Layout mengikuti lebar viewport. | Layout mengikuti lebar viewport; navigasi bawah/drawer mengambil ruang layar. | Source tidak menunjukkan alur khusus desktop/mobile, tetapi sentuhan, scroll panjang, keyboard virtual, dan dialog perlu uji perangkat nyata. |
| Instalasi PWA dan offline | Bergantung dukungan browser/OS. | Dapat ditambahkan ke layar utama pada browser/OS yang mendukung; perilaku install berbeda menurut platform. | Ini perbedaan kemampuan platform, bukan fitur peran. Tidak ada offline write queue di kedua mode. |

**Batas audit:** tidak ditemukan feature flag yang menyembunyikan modul
berdasarkan viewport, tetapi laporan ini bukan hasil uji browser. Beberapa
aksi admin sensitif dan detail tetap memerlukan konfirmasi pada UI; jangan
menganggap semua layout mobile sudah diuji untuk keyboard, scroll, safe-area,
aksesibilitas, atau ukuran sentuh.

## Studi kasus Petugas — siklus penggunaan fitur

**Skenario:** Rina menjalankan shift pagi, bekerja bersama Dedi, melaporkan
kerusakan alat, menutup shift, lalu memeriksa laporannya.

1. Rina login dengan username dan PIN, lalu masuk ke beranda/`/daftar-shift`.
   Ia melihat ringkasan shift dan incident, notifikasi yang ditampilkan, serta
   tautan pintas. Ia dapat membuka panduan atau **Ganti PIN** dari navigasi,
   kemudian logout setelah selesai. Notifikasi beranda adalah ringkasan/link,
   bukan bukti bahwa semua mekanisme notifikasi atau push tersedia.
2. Ia memilih cabang yang memang dapat diakses dan shift yang benar. Saat
   membuka shift baru, Rina menjadi PJ. Dedi kemudian bergabung/check-in pada
   instance yang sama. Jika shift dibuka admin atas nama Rina, ia dapat
   melanjutkan instance tersebut. Aplikasi tidak membuat jadwal petugas.
3. Di `/shift/[id]`, mereka melihat progress dan daftar peserta, lalu mengisi
   tipe item yang dikonfigurasi, misalnya centang, teks/paragraf, angka,
   pilihan, tanggal/waktu, atau foto. Aksi menyimpan pelaku dan waktu. Rina
   melewati item yang tidak dapat dikerjakan dengan alasan atau membatalkan
   jawaban bila perlu. Jika Dedi lebih dulu menyelesaikan item yang sama,
   mereka membaca hasil konflik/rekonsiliasi dan memeriksa status sebelum
   mencoba lagi.
4. Ketika menemukan kerusakan, Rina membuat incident melalui
   `/incident/baru`, memilih kategori, waktu kejadian, deskripsi, dan kaitan
   shift bila sesuai. Foto bukti opsional: WebP/PNG/JPEG, maksimum 5 MB per
   foto dan hingga lima foto per owner. Di `/incident`, ia memeriksa daftar;
   di `/incident/[id]`, ia melihat status, bukti, dan timeline lalu
   menambahkan catatan tindak lanjut tanpa menimpa deskripsi awal.
5. Sebagai PJ, Rina membuka dialog **Tutup Shift**. Ia menyelesaikan semua
   item wajib atau memberi alasan skip, mengisi field handover wajib sesuai
   tipe yang disiapkan admin, menambah catatan bila perlu, lalu menyatakan
   apakah ada incident yang harus diteruskan. Ia memasukkan PIN miliknya untuk
   konfirmasi. Jika syarat belum lengkap, ia kembali memperbaiki bagian yang
   ditunjukkan UI.
6. Setelah penutupan berhasil, shift terkunci untuk alur edit biasa dan report
   dibuat. Rina membuka `/report`, lalu `/report/[id]` untuk meninjau
   checklist, peserta, handover, incident, foto, dan addendum yang tersedia.
   Jika admin membagikan link laporan, penerima link dapat membaca laporan
   read-only selama token masih valid.
7. Pada shift berikutnya, Rina login kembali bila sesi tidak aktif dan
   mengulangi alur untuk cabang yang diizinkan. Jika koneksi terputus, ia tidak
   menganggap write berhasil: service worker hanya cache aset shell dan tidak
   ada antrean offline untuk checklist, incident, atau handover.

**Fitur Petugas yang tercakup:** login/logout, ganti PIN, beranda/ringkasan,
navigasi dan panduan; akses cabang; buka/gabung/check-in/lanjutkan shift;
checklist bersama, beragam input, skip/cancel, progress/peserta dan
rekonsiliasi konflik; incident dan foto, daftar/detail/catatan tindak lanjut;
handover dan konfirmasi PJ pada penutupan; laporan daftar/detail; link publik
read-only; install/PWA dan perilaku saat offline.

**Alasan nilai 3,5/5:** alur operasional utama terlihat langsung dan aktivitas
shift terkumpul dalam satu instance bersama. Friksi terbesarnya ialah beban PJ
di akhir shift, prasyarat handover/checklist, bentuk input yang berubah sesuai
konfigurasi, konflik kolaborasi yang harus dipahami, dan ketergantungan
koneksi internet.

## Studi kasus Admin — konfigurasi dan persiapan

**Skenario:** Sari menyiapkan cabang baru agar petugas dapat mulai mengerjakan
SOP dan mencatat shift.

1. Sari login sebagai Admin dan memeriksa Dashboard untuk ringkasan yang
   tersedia. Di **Cabang**, ia membuat/mengubah informasi cabang, zona waktu,
   status, serta referensi spreadsheet/folder yang sesuai. Jika ada konfigurasi
   serupa, ia menyalin konfigurasi dari cabang sumber.
2. Di **Akun**, ia membuat akun Petugas/Admin, memilih peran dan akses cabang,
   lalu mengubah atau menonaktifkan akun saat diperlukan. UI juga menyediakan
   reset PIN, unlock, dan force-logout. Token sesi aplikasi stateless sehingga
   force-logout tidak berarti semua token di perangkat lain otomatis dicabut.
3. Di **Shift**, Sari membuat/mengubah definisi shift, mengaktifkan atau
   menonaktifkan, menduplikasi atau menyalin konfigurasi, dan melihat preview.
   Di **Checklist / SOP**, ia menyiapkan kategori dan item, urutan, status
   aktif, kewajiban, tipe input, opsi, serta target/rentang yang tersedia;
   kategori/item dapat diperbarui atau diduplikasi. Di **Handover**, ia
   menambah, mengubah, mengurutkan, dan menonaktifkan field serah terima.
4. Ia membuka area **Incident/Kategori** untuk mengatur kategori yang
   digunakan petugas. Di **Pengaturan**, ia mengubah hanya opsi yang tersedia
   di katalog aplikasi. Perubahan template berlaku bagi shift yang dibuka
   setelah perubahan; instance yang berjalan memakai snapshot sendiri.
5. Petugas mulai memakai konfigurasi baru. Sari kembali ke Dashboard untuk
   memeriksa ringkasan dan ke Audit Log untuk meninjau tindakan yang tercatat.

**Fitur Admin yang tercakup:** Dashboard; pengelolaan dan penyalinan konfigurasi
cabang; pengelolaan akun, peran, akses cabang, reset PIN, unlock, dan
force-logout; definisi shift dan preview; kategori/item checklist dan
duplikasi; field handover; kategori incident; Pengaturan; Audit Log.

## Studi kasus Admin — operasi, incident, dan laporan

**Skenario:** satu shift lintas cabang tertinggal terbuka, ada incident yang
perlu ditindaklanjuti, dan manajer meminta laporan.

1. Di **Operasi Shift**, Sari mencari/filter instance lintas cabang. Jika PJ
   berhalangan, ia dapat membuka shift atas nama petugas, mengganti PJ,
   menutup paksa, atau melakukan void pada instance yang salah. Ia memastikan
   cabang, instance, status, alasan, dan konsekuensi sebelum mengonfirmasi;
   persyaratan alasan/PIN mengikuti masing-masing handler dan tidak seragam.
2. Di **Incident**, Sari menyaring daftar menurut status, kategori, cabang,
   dan tanggal, lalu memeriksa detail serta foto. Ia memperbarui status yang
   tersedia, menautkan incident ke shift bila sesuai, dan menambahkan catatan
   tindak lanjut. Tab **Kategori** digunakan untuk mengelola taksonomi
   incident.
3. Di **Laporan**, Sari memfilter laporan (misalnya cabang/tanggal/PJ),
   membuka detail, mengunduh ekspor CSV, membuat link berbagi dengan opsi
   berlaku yang tersedia, lalu mencabut token saat akses publik tidak lagi
   diperlukan. Koreksi historis dicatat melalui addendum, bukan dengan
   mengedit checklist shift tertutup.
4. Jika diperlukan, Sari meninjau **Audit Log** untuk konteks tindakan.
   Hash/audit bukan jaminan bahwa pemilik spreadsheet tidak dapat mengubah
   data manual; `/api/cron/verify` juga bukan verifier hash-chain.
5. Statistik yang tampil hanya cakupan Dashboard/endpoint yang tersedia.
   Sari tidak menjanjikan laporan statistik lengkap, PDF export, notifikasi
   push, atau penjadwalan petugas karena fitur-fitur itu tidak terbukti aktif
   pada source saat audit.

**Fitur Admin yang tercakup:** operasi shift lintas cabang termasuk
open-on-behalf/change-PJ/force-close/void; pengelolaan dan penautan incident;
laporan filter/detail/ekspor CSV/share/revoke/addendum; Audit Log; Dashboard
dan batas statistik yang tersedia.

**Alasan nilai 2,5/5:** Admin memiliki kontrol menyeluruh, tetapi tugas jarang
dilakukan dan berdampak tinggi bercampur dengan konfigurasi rutin. Ia perlu
memahami struktur cabang, snapshot, akses, status instance, dan dampak aksi;
menu menyediakan banyak tujuan dan UI belum menjadikan semua operasi satu
wizard yang terpandu.

## Rekomendasi agar nilai tiap role mencapai minimal 4/5

Target berikut adalah sasaran desain dan validasi, bukan klaim bahwa skor sudah
naik. Kerjakan lintas perangkat: jangan memperbaiki alur desktop dengan
mengorbankan tampilan mobile, atau sebaliknya.

### Petugas: dari 3,5 menjadi minimal 4/5

1. **Jelaskan tanggung jawab sebelum membuka shift.** Tampilkan siapa yang akan
   menjadi PJ dan kewajibannya menutup shift sebelum tombol konfirmasi; sediakan
   ringkasan shift/cabang agar salah pilih bisa dibatalkan sebelum mulai.
2. **Buat checklist dan penutupan lebih terpandu.** Kelompokkan item wajib yang
   belum selesai, jelaskan alasan skip yang diterima, tunjukkan field handover
   wajib yang masih kosong, dan pertahankan step/progress penutupan sampai
   laporan berhasil terbentuk.
3. **Beri kepastian status write.** Tampilkan status menyimpan/berhasil/gagal
   yang jelas; setelah konflik atau timeout, ambil status server sebelum
   menawarkan ulang aksi agar petugas tidak mengirim duplikasi. Jangan klaim
   offline save tanpa implementasi queue dan sinkronisasi.
4. **Kurangi beban belajar.** Tambahkan panduan singkat kontekstual untuk
   petugas baru di daftar shift, checklist, incident, dan penutupan; gunakan
   istilah aksi yang konsisten di layar kecil maupun besar.
5. **Uji form di perangkat kerja nyata.** Pastikan tombol, input foto,
   keyboard virtual, dialog penutupan, navigasi bawah, dan konten tidak
   tertutup atau memerlukan scroll horizontal pada ponsel kecil.

### Admin: dari 2,5 menjadi minimal 4/5

1. **Sediakan jalur tugas yang terarah.** Untuk setup cabang, susun langkah
   Cabang → Shift → Checklist/SOP → Handover → Akun/akses, dengan validasi
   kelengkapan dan tautan ke editor masing-masing. Pertahankan tiap editor
   terpisah agar tidak menjadi satu form besar.
2. **Buat navigasi dan konteks lebih mudah ditemukan.** Pertahankan kelompok
   sidebar desktop dan drawer mobile, tambahkan judul/breadcrumb dan cabang
   aktif yang konsisten, serta akses cepat ke Kategori dari area Incident.
   Pada mobile, pastikan setiap item drawer dapat dicapai tanpa menutupi
   konten atau tombol aksi.
3. **Seragamkan operasi berisiko.** Gunakan dialog konfirmasi dengan ringkasan
   cabang/shift/pengguna terdampak, konsekuensi, alasan wajib, dan PIN bila
   handler mensyaratkannya untuk force-close, change-PJ, void, perubahan akun,
   reset PIN, dan tindakan konfigurasi. Sediakan hasil sukses/gagal serta
   langkah pemulihan yang jelas.
4. **Percepat pencarian dan peninjauan.** Pertahankan filter cabang/status/
   tanggal/PJ yang relevan, tampilkan filter aktif dan jumlah hasil, serta
   jaga filter saat kembali dari detail atau setelah aksi. Pastikan tabel
   desktop dan kartu mobile menampilkan identitas serta aksi penting yang sama.
5. **Pisahkan yang tersedia dari yang belum tersedia.** Labeli cakupan
   statistik dan ekspor secara eksplisit; jangan tampilkan affordance PDF,
   jadwal petugas, push, atau verifier audit sampai implementasinya ada.

### Cara membuktikan target 4/5

- Uji terpisah dengan sedikitnya **5 Petugas dan 5 Admin** yang mewakili
  pengguna baru dan berpengalaman; gunakan perangkat utama masing-masing.
- Jalankan skenario end-to-end di bagian atas tanpa coaching, di desktop dan
  ponsel untuk peran yang menggunakan keduanya. Catat keberhasilan tanpa
  bantuan, waktu tugas, salah cabang/shift, aksi duplikat, dan kebutuhan
  meminta bantuan.
- Sasaran rilis: rata-rata penilaian kemudahan setiap peran **≥4/5**,
  sedikitnya **4 dari 5 peserta per role** menyelesaikan tugas kritis tanpa
  bantuan, tidak ada kesalahan kritis yang menyebabkan operasi pada cabang/
  shift yang salah, dan tidak ada perbedaan fungsi yang tidak disengaja antar
  viewport. Ulangi test setelah perbaikan; skor inspeksi dokumen saja tidak
  cukup untuk mengklaim target tercapai.

## Rencana eksekusi peningkatan kemudahan

Rencana ini menerjemahkan rekomendasi di atas menjadi tahapan implementasi dan
gate penerimaan. Fokusnya memperbaiki tugas aktif yang menurunkan kemudahan;
fitur yang belum ada seperti offline write queue, PDF, penjadwalan, push, atau
verifikasi hash-chain **tidak** dianggap termasuk scope kecuali disetujui
sebagai proyek terpisah. Kerjakan pada Registry/spreadsheet uji dan jangan
mengubah data produksi saat validasi.

### Status pelaksanaan

| Fase | Status | Bukti / batasan |
|---|---|---|
| 0 — Baseline | **Parsial** | `npm run lint` lulus dengan warning yang sudah ada; `npm run typecheck` lulus. Rating 3,5/5 Petugas dan 2,5/5 Admin masih inspeksi source. Belum tersedia Google staging, uji browser pada perangkat nyata, atau peserta untuk baseline empiris. |
| 1 — Petugas | **Selesai (implementasi)** | Konfirmasi sebelum membuka shift memperlihatkan cabang/shift/tanggal/jadwal dan tanggung jawab PJ. Dialog penutupan menyebut shift dan field handover wajib yang belum lengkap. Typecheck dan lint lulus; lint masih memiliki warning existing. Belum ada uji browser/petugas langsung. |
| 2 — Admin setup | **Selesai (panduan navigasi)** | Dashboard Admin kini memberi urutan tautan Cabang → Shift → Checklist/SOP → Handover → Akun & akses, dengan keterangan bahwa ini bukan pemeriksaan kelengkapan otomatis. Semua tautan telah dicocokkan dengan route yang ada. Lint/typecheck/build lulus; belum ada usability test. |
| 3 — Admin operasi | **Selesai (implementasi)** | Alur "buka atas nama" kini meminta cabang, memuat shift cabang tersebut, hanya menampilkan petugas aktif yang memiliki akses cabang, serta menampilkan ringkasan dampak sebelum submit. Server memvalidasi akses cabang/role, memakai zona waktu cabang, menjaga BR-01/idempotensi, dan melaporkan konflik tanpa membuat shift duplikat. Route definisi shift juga menghormati cabang URL. Lint/typecheck/build lulus; belum ada staging test. |
| 4 — Responsif | **Selesai (review source)** | Panduan dashboard memakai grid adaptif; daftar Operasi Shift memakai `ResponsiveRecordCards`; dialog Admin dan Petugas dibatasi tinggi viewport dan dapat discroll. Review source selesai, tetapi tidak ada browser/device matrix yang tersedia untuk verifikasi visual langsung. |
| 5 — Uji penerimaan | **Terhalang** | Typecheck, lint, build dan pemeriksaan diff lulus. Belum ada pengujian peserta nyata; target rata-rata ≥4/5 dan tingkat penyelesaian tugas tidak boleh diklaim tercapai sebelum tes Petugas/Admin dilakukan. |

#### Catatan hasil implementasi

- Alur Petugas mempertahankan payload dan aturan bisnis yang ada; konfirmasi menampilkan cabang, shift, tanggal, jadwal, dan peran PJ. Saat menutup shift, handover menjelaskan field wajib yang belum diisi.
- Dashboard Admin memberi jalur mulai untuk konfigurasi tanpa menyajikan status kelengkapan palsu.
- Alur multi-cabang Admin sebelumnya memakai `CBGBDG01`, salah membaca bentuk respons pengguna, dan service selalu memilih cabang pertama. Ketiga sumber kesalahan tersebut telah ditangani dengan pilihan cabang eksplisit, bentuk API yang benar, filter petugas per cabang, dan validasi server.
- `npm run typecheck`, `npm run lint`, `npm run build`, dan `git diff --check` berhasil. Lint melaporkan warning yang sudah ada; build juga melaporkan warning CSS `::highlight` dari dokumentasi.
- Skor usability masih merupakan estimasi inspeksi source, bukan hasil observasi. Validasi akhir membutuhkan staging Sheets, browser desktop/mobile, serta sedikitnya lima Petugas dan lima Admin sesuai kriteria rencana.

### Urutan dan dependensi

| Fase | Fokus | Bergantung pada | Hasil/gate |
|---|---|---|---|
| 0 | Baseline, definisi tugas, dan instrumentasi uji | Tidak ada | Ada catatan skor dan kesalahan saat ini per role/perangkat; kriteria rilis disepakati. |
| 1 | Petugas: PJ, checklist, penutupan, kepastian aksi, panduan kontekstual | Fase 0 | Alur shift kritis dapat diselesaikan tanpa bantuan dan write tidak menimbulkan aksi ganda. |
| 2 | Admin: navigasi, konteks cabang, jalur setup terpandu | Fase 0; gunakan komponen/desain fase 1 bila relevan | Admin dapat menyiapkan cabang/template/akun tanpa kehilangan konteks atau melewatkan prasyarat. |
| 3 | Admin: aksi berisiko, pencarian, incident, dan laporan | Fase 0; fase 2 untuk konsistensi navigasi/konteks | Aksi sensitif menampilkan target/dampak, dan tugas investigasi/laporan dapat ditelusuri dengan jelas. |
| 4 | Kesetaraan responsif dan pengujian lintas perangkat | Fase 1–3 | Fitur bisnis dan aksi penting setara; perbedaan hanya pada penyajian/navigasi yang disengaja. |
| 5 | Uji pengguna, perbaikan temuan, dan penilaian ulang | Fase 1–4 | Lulus target pengalaman per role; nilai dokumen diperbarui dari data aktual. |

Fase dapat dikerjakan sebagai rilis bertahap. Jangan memulai perubahan yang
menyentuh write checklist/penutupan atau operasi admin sebelum baseline,
kontrak route terkait, dan lingkungan uji tersedia.

### Fase 0 — Baseline dan persiapan

- [ ] Tetapkan skenario uji yang sama dengan studi kasus Petugas dan Admin di
  dokumen ini; tandai mana yang berlaku untuk mobile, desktop, atau keduanya.
- [ ] Siapkan data uji, akun Petugas dan Admin, satu cabang uji, dua perangkat/
  browser, serta prosedur reset data yang aman.
- [ ] Catat pada tiap tugas: berhasil/tidak, waktu selesai, jumlah salah pilih
  cabang/shift, write ulang/duplikat, error yang tidak dipahami, bantuan yang
  diminta, serta rating kemudahan 1–5.
- [ ] Rekam baseline terpisah untuk alur rutin dan alur pengecualian; jangan
  gabungkan rata-rata Petugas dan Admin menjadi satu angka saja.
- [ ] Inventarisasi kontrol saat ini untuk PJ, skip, handover wajib, hasil
  konflik, status save, alasan/PIN operasi admin, filter, dan akses mobile.

**Selesai bila:** ada baseline yang dapat diulang, sumber data uji terisolasi,
serta skenario/ukuran keberhasilan telah disepakati sebelum UI diubah.

### Fase 1 — Petugas: sederhanakan siklus shift

Area utama yang diperkirakan disentuh: `components/shift/shift-dashboard.tsx`,
`components/shift/shift-checklist.tsx`,
`components/shift/shift-close-dialog.tsx`, alur incident dan komponen status
aksi yang benar-benar ditemukan setelah baseline.

- [ ] Saat membuka shift, tampilkan ringkasan cabang/tanggal/definisi shift,
  jelaskan bahwa pembuka menjadi PJ dan tanggung jawab penutupan, lalu minta
  konfirmasi sebelum request pembukaan dikirim.
- [ ] Di checklist, sediakan fokus/penyaring untuk item wajib yang belum
  selesai. Pada skip, jelaskan kapan skip dapat dipakai dan validasi alasan
  sebelum aksi dikirim. Pertahankan identitas item/kategori dan state agar
  filter tidak menyembunyikan konflik.
- [ ] Di dialog penutupan, tampilkan progress dan daftar syarat yang belum
  terpenuhi; bawa fokus ke field/item pertama yang harus diperbaiki. Tampilkan
  step saat ini, field handover wajib, dan kondisi tombol lanjut/tutup.
- [ ] Setelah aksi, tunjukkan status menyimpan, berhasil, gagal, atau konflik
  dengan bahasa yang spesifik. Pada timeout/konflik, baca ulang status server
  sebelum menawarkan retry; gunakan idempotency yang sudah ada dan jangan
  membuat write kedua secara optimistis.
- [ ] Pastikan report number/hasil penutupan hanya ditampilkan sebagai sukses
  setelah server menyatakan penutupan berhasil. Bila operasi parsial gagal,
  jelaskan langkah aman berikutnya tanpa mengklaim data tersimpan utuh.
- [ ] Tambahkan bantuan kontekstual yang ringkas pada daftar shift, checklist,
  pembuatan incident, dan penutupan. Gunakan istilah yang sama di desktop dan
  mobile; jangan menggantikan label UI dengan dokumentasi panjang.
- [ ] Pertahankan pengalaman koneksi jujur: ketika offline, nonaktifkan atau
  gagalkan write dengan pesan/retry yang aman. Jangan menyatakan data disimpan
  offline sampai queue, konflik sinkronisasi, dan recovery dibangun serta diuji.

**Selesai bila:** Petugas uji dapat membuka/mengikuti shift, mengerjakan dan
skip item, mencatat incident, menyelesaikan handover, menutup sebagai PJ, dan
meninjau laporan tanpa kesalahan kritis; aksi bersamaan tidak menghasilkan
duplikasi yang tidak terjelaskan.

### Fase 2 — Admin: navigasi dan jalur setup

Area utama: `components/NavbarClient.tsx`, `app/admin/layout.tsx`, halaman
Cabang/Akun/Shift/Checklist Builder/Handover Builder, dan komponen notice/
breadcrumb yang dipakai bersama bila pola existing mendukung.

- [ ] Tambahkan judul halaman dan breadcrumb yang konsisten; selalu tampilkan
  nama/kode cabang yang sedang dipilih pada editor yang bergantung pada cabang.
- [ ] Buat jalur setup cabang berbentuk checklist/langkah berurutan:
  **Cabang → Shift → Checklist/SOP → Handover → Akun/akses**. Setiap langkah
  mengarah ke editor aslinya, menunjukkan status lengkap/belum lengkap, dan
  memungkinkan Admin melanjutkan tanpa menggabungkan editor berbeda menjadi
  satu form besar.
- [ ] Sediakan validasi prasyarat sebelum cabang diaktifkan atau sebelum
  konfigurasi dianggap siap dipakai. Pesan harus menyebut hal yang kurang dan
  menyediakan tautan langsung untuk memperbaikinya.
- [ ] Pertahankan kelompok menu desktop dan drawer mobile. Pastikan kategori
  incident mudah dijangkau dari area Incident, seluruh item menu mobile dapat
  ditemukan, dan active state tetap benar saat membuka URL langsung.
- [ ] Tampilkan konteks cabang konsisten pada operasi yang bisa lintas cabang;
  bedakan tegas mode satu cabang dan lintas cabang.

**Selesai bila:** Admin baru dapat mengikuti urutan setup di staging, selalu
mengetahui cabang/area yang sedang diedit, dan dapat membuka setiap halaman
melalui menu maupun direct URL tanpa kehilangan konteks.

### Fase 3 — Admin: amankan tindakan dan percepat tugas rutin

Area utama: `app/admin/operasi-shift/page.tsx`, `app/admin/akun/page.tsx`,
`app/admin/incident/page.tsx`, `app/admin/laporan/page.tsx`,
`app/admin/audit-log/page.tsx`, dialog sensitif dan API yang terkait.

- [ ] Untuk force-close, change-PJ, void, open-on-behalf, perubahan akun,
  reset PIN, dan tindakan berisiko lain, tampilkan target yang terdampak
  (cabang, shift/instance, pengguna), keadaan sekarang, konsekuensi, serta
  ringkasan perubahan sebelum submit.
- [ ] Selaraskan teks konfirmasi, alasan wajib, dan permintaan PIN **dengan
  persyaratan setiap handler**. Jangan menambah/menghilangkan kontrol
  otorisasi hanya di UI; validasi server tetap sumber keputusan.
- [ ] Cegah submit ganda ketika request berjalan; tampilkan hasil server,
  kegagalan parsial jika diketahui, serta tindakan lanjutan yang aman.
  Sediakan pembatalan sebelum commit untuk tindakan yang masih dapat
  dibatalkan, bukan mengklaim undo untuk aksi yang tidak reversible.
- [ ] Pada daftar admin, tampilkan filter aktif, jumlah hasil, state kosong,
  dan tombol reset filter. Pertahankan filter/sort/page yang relevan setelah
  refresh atau kembali dari detail.
- [ ] Bandingkan informasi dan aksi pada tabel desktop dengan kartu mobile;
  identitas record, status, dan tindakan penting harus setara, tidak hanya
  visual serupa.
- [ ] Tandai cakupan statistik dan jenis ekspor yang benar-benar tersedia.
  Jangan tampilkan tombol/tautan mati untuk PDF, statistik yang belum ada,
  penjadwalan, push, atau verifier audit.
- [ ] Audit label force-logout agar sesuai implementasi sesi stateless.
  Jika kebutuhan produk adalah mencabut token lintas perangkat, buat desain
  revocation server-side sebagai pekerjaan keamanan terpisah dan uji expiry/
  logout sebelum menyebutnya didukung. Risiko PIN plaintext dan tidak adanya
  throttling juga memerlukan backlog keamanan tersendiri; jangan menyelesaikan
  risiko itu hanya dengan perubahan copy/UI.

**Selesai bila:** Admin dapat mengidentifikasi objek dan dampak sebelum
mutasi, tidak terjadi submit ganda pada aksi cepat, dan pencarian laporan/
incident/shift tetap dapat dilanjutkan tanpa kehilangan filter secara
mengejutkan.

### Fase 4 — kesetaraan desktop dan mobile

- [ ] Buat matriks route × role × viewport untuk seluruh alur studi kasus:
  Petugas login/shift/checklist/incident/penutupan/report; Admin setup,
  akun/template, operasi, incident, laporan/share, pengaturan, audit.
- [ ] Uji setidaknya ponsel sempit (320–375 px), ponsel umum, tablet, dan
  desktop pada browser/OS yang benar-benar dipakai. Catat browser/versi dan
  breakpoint aktual, bukan hanya emulasi viewport.
- [ ] Uji keyboard virtual dan scroll pada form panjang, foto/file picker,
  dialog sensitif, safe-area, bottom navigation, drawer, tabel/kartu, serta
  tombol simpan/konfirmasi agar tidak tertutup.
- [ ] Uji keyboard/focus, label kontrol, kontras, target sentuh, zoom, dan
  pembacaan error di kedua layout; responsif tidak otomatis berarti aksesibel.
- [ ] Untuk setiap perbedaan menu, dokumentasikan apakah hanya perubahan
  presentasi atau pembatasan fungsional yang memang disengaja. Semua fitur
  bisnis harus dapat dicapai pada kedua mode kecuali ada alasan produk dan
  fallback yang disetujui.

**Selesai bila:** seluruh skenario kritis dapat diselesaikan pada perangkat
yang didukung tanpa scroll horizontal tak disengaja, kontrol tertutup, atau
ketimpangan aksi/field penting antar viewport; isu aksesibilitas kritis
ditangani atau dicatat sebagai blocker.

### Fase 5 — uji pengguna dan gate rilis

- [ ] Uji sedikitnya **5 Petugas dan 5 Admin**, mencakup pengguna baru dan
  berpengalaman. Gunakan perangkat utama peserta dan jangan memberi coaching
  selama tugas; sediakan intervensi hanya bila keselamatan/data uji terancam.
- [ ] Jalankan skenario per role pada bagian studi kasus. Pastikan operasi
  lintas cabang, konflik dua petugas, force-close/void simulasi, dan share/
  revoke hanya memakai lingkungan/data uji.
- [ ] Catat rating 1–5 per role setelah tugas, task success tanpa bantuan,
  waktu, error kritis, salah objek/cabang, retry/duplikasi, dan komentar
  peserta. Jangan gabungkan hasil Petugas dan Admin.
- [ ] Prioritaskan temuan berdasarkan dampak (keselamatan/integritas data,
  tugas terblokir, salah objek, kesalahan berulang, lalu friksi kosmetik);
  perbaiki blocker dan ulangi skenario terdampak.
- [ ] Jalankan `npm run lint`, `npm run typecheck`, `npm run build`, serta
  skenario manual/integrasi relevan dari `PLAN/TESTING.md`. Tambahkan tes
  otomatis untuk perubahan write/role/konkurensi bila belum tersedia.
- [ ] Perbarui rating dan laporan ini hanya memakai data pascauji. Jika nilai
  satu role masih di bawah 4/5 atau terjadi salah cabang/shift/aksi kritis,
  jangan nyatakan target tercapai; catat blocker dan ulangi iterasi.

**Kriteria penerimaan akhir:** rata-rata rating Petugas **≥4/5** dan Admin
**≥4/5**; sedikitnya 4/5 peserta per role menyelesaikan tugas kritis tanpa
bantuan; tidak ada salah operasi cabang/shift, write ganda yang tidak aman,
atau kontrol penting yang tidak dapat dicapai di perangkat yang didukung.
Simpan hasil uji (tanggal, versi build, browser/perangkat, hasil per skenario,
temuan dan keputusan) sebagai artefak rilis; jangan menaruh data pribadi
peserta atau rahasia di dokumen.

### Artefak yang harus diperbarui saat eksekusi

- `PLAN/penilaian-kemudahan.md` — rekomendasi, skor sebelum/sesudah, dan
  ringkasan hasil uji.
- `PLAN/TESTING.md` — checklist perilaku/regresi yang ditambah atau dijalankan.
- Komponen/route yang ditemukan saat implementasi — jangan mengubah route atau
  kontrak bisnis tanpa mencatat dampak dan memvalidasi otorisasi.
- Catatan rilis atau tiket kerja tim — daftar blocker, keputusan scope, dan
  hasil penerimaan per fase.

## Dasar penilaian dari source

### Yang membantu pengguna

- `/` mengarahkan Petugas ke `/daftar-shift`; beranda merangkum shift, incident,
  notifikasi, serta pintasan (`app/page.tsx`, `components/shift/petugas-home.tsx`).
- Halaman shift menampilkan progress/peserta dan menangani aksi checklist serta
  konflik (`components/shift/shift-checklist.tsx`).
- Penutupan shift memiliki dialog bertahap dengan prasyarat
  (`components/shift/shift-close-dialog.tsx`).
- Navigasi Admin dikelompokkan di desktop dan mobile
  (`components/NavbarClient.tsx`).
- Loading/error state, konektivitas, dan install prompt tersedia pada bagian
  tertentu.

### Yang menahan nilai pengguna

- Pembuka shift menjadi PJ dan bertanggung jawab pada langkah penutupan.
- Offline write queue tidak ditemukan; PWA hanya cache aset shell terpilih.
- Flag `Must_Change_Pin` dan halaman ganti PIN tersedia, tetapi tidak ada
  forced redirect global dari `AuthGuard`.
- Tugas Admin tersebar dan operasi pengecualian memiliki konsekuensi berbeda.
- Nilai belum tervalidasi melalui pengamatan Petugas/Admin; label, aksesibilitas,
  waktu penyelesaian, dan beban kesalahan belum diuji dengan pengguna.

### Dasar penilaian developer

- Satu project Next.js dengan area terpisah: `app/api/`, `app/admin/`,
  `components/`, `lib/google/`, `lib/admin/`, dan `lib/domain/`.
- `package.json` menyediakan lint, typecheck, dan build.
- Header schema berada di `lib/google/branch-schema.ts`; helper akses Sheets
  dipusatkan di `lib/store.ts` dan `lib/google/sheets.ts`.
- Tidak ditemukan `npm test`, test runner, atau file test/spec aplikasi.
- Google Sheets tidak menyediakan transaction/constraint/row lock; BR-01,
  BR-12, dan write beberapa sheet bergantung pada logic serta rekonsiliasi.
- Validasi tersebar antara Zod dan pemeriksaan manual; developer perlu membaca
  kontrak route yang disentuh.
- Risiko PIN plaintext dan sesi stateless memerlukan perhatian saat mengubah
  autentikasi.

## Peningkatan bernilai tinggi

1. Validasi rating dengan usability test Petugas dan Admin; ukur tugas buka/
   bergabung, skip, tutup, setup cabang/template, pemulihan shift, dan laporan.
2. Jelaskan sebelum membuka shift bahwa pembuka menjadi PJ; tampilkan checklist
   prasyarat serta status yang belum lengkap sebelum penutupan.
3. Tambahkan test otomatis auth/access, BR-01, BR-12, close/report, dan aksi
   admin; pertahankan uji concurrency dua pengguna.
4. Konsistenkan kontrak API, pesan error, dan validasi input.
5. Prioritaskan risiko autentikasi (PIN plaintext, throttling, revocation sesi)
   sebagai pekerjaan engineering, bukan menganggapnya selesai karena
   dokumentasi menyebutnya.

## Batasan

- Rating berbasis inspeksi repository, bukan moderated usability test,
  wawancara, SUS, analisis aksesibilitas, atau pengamatan produktivitas tim.
- Daftar skenario mencakup fitur aktif yang tampak pada UI per peran; route API
  yang tidak terhubung ke UI dan requirement yang belum aktif tidak disajikan
  sebagai alur pengguna yang tersedia.
- Keberadaan route/komponen tidak membuktikan alur berhasil pada spreadsheet
  produksi.
- Tinjau ulang skor setelah uji pengguna nyata dan setelah gap teknis utama
  ditangani.
