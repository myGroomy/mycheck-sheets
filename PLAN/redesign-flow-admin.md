# Analisis dan Rekomendasi Redesign Flow Admin

> Catatan perubahan navigasi. Klaim bagian "Sebelum redesign" mendokumentasikan
> kondisi lama; navigasi source saat ini adalah sidebar admin di layar lebar,
> empat tujuan inti di bottom navigation layar kecil, dan menu Lainnya untuk
> konfigurasi/administrasi. Incident dan Kategori Incident berada pada satu
> area navigasi dengan tab; seluruh URL halaman tetap dipertahankan.

## Ringkasan keputusan

Menu admin **belum berlebihan dari sisi jumlah fungsi**, tetapi navigasinya terasa tersebar: ada 12 halaman yang dibagi antara empat tautan utama dan delapan tautan di menu “Pengelolaan”. Pengguna harus memahami lebih dulu apakah sebuah fungsi berada di menu inti atau menu tambahan.

Hasil penerapan: navigasi admin disusun ulang menjadi tujuan yang dikelompokkan menurut pekerjaan admin. **Incident** dan **Kategori Incident** kini berada dalam satu area dengan tab internal. Halaman konfigurasi dikelompokkan tanpa mencampur editor Checklist, Handover, Shift, dan Cabang menjadi satu halaman. Semua URL yang sudah ada tetap dipertahankan.

## Temuan: UI yang berjalan

Sebelum redesign, `components/NavbarClient.tsx` menampilkan empat item admin utama:

1. Dashboard
2. Cabang
3. Operasi
4. Incident

Delapan item lain berada dalam menu “Pengelolaan”:

1. Akun
2. Shift
3. Checklist Builder
4. Handover Builder
5. Kategori Incident
6. Laporan
7. Pengaturan
8. Audit Log

Sebelum redesign, terdapat **12 tujuan halaman admin**. Di desktop, empat tautan terlihat langsung dan delapan lainnya tersembunyi di dropdown. Di HP, empat tautan inti muncul di bottom navigation, sedangkan sisanya ada di drawer “Lainnya”.

Setelah redesign, desktop menggunakan sidebar berkelompok. Incident dan Kategori berada dalam satu tujuan yang memiliki dua tab. Di HP, Dashboard, Operasi, Incident, dan Laporan berada di bottom navigation; konfigurasi dan administrasi lainnya berada dalam drawer.

## Perbandingan dengan dokumen produk

- **PRD S5.2** mendeskripsikan sidebar admin dengan 13 simpul: Dashboard, Cabang, Akun, Shift, Checklist Builder, Handover Builder, Kategori Incident, Operasi Shift, Incident, Laporan, Pengaturan, Audit Log, dan Pratinjau sebagai petugas.
- **APP_FLOW S6** mencantumkan 12 modul halaman serta Mode Pratinjau. Mode Pratinjau adalah kemampuan/aksi, bukan halaman navigasi; karena itu hitungan halaman efektifnya juga 12.
- Sebelum perubahan UI ini, navigasi memakai top navigation dan dropdown, bukan sidebar. Label “Operasi” merupakan pemendekan dari “Operasi Shift”.
- APP_FLOW menyebut **Laporan dan Statistik** sebagai satu modul dengan tab Daftar dan Statistik. Halaman `/admin/laporan` yang ada sekarang berpusat pada daftar, berbagi, dan ekspor laporan; tab Statistik belum tampak.
- Mode Pratinjau tidak tampak sebagai item navigasi global. Sebelum implementasi redesign, perlu dipastikan apakah kemampuan tersebut sudah tersedia dalam konteks builder atau memang masih perlu dibangun. Rekomendasi ini tidak menganggapnya sebagai halaman baru.

Dokumen produk adalah sumber perilaku yang diutamakan. Karena itu, perubahan bentuk navigasi perlu menjaga fungsi yang ditetapkan PRD/APP_FLOW dan mencatat kebutuhan statistik yang belum tampak, bukan diam-diam mengubah ruang lingkup produk.

## Apakah tab admin terlalu banyak?

Jumlah 12 halaman sendiri masih masuk akal untuk admin yang menangani banyak cabang, konfigurasi, operasi shift, insiden, laporan, akun, dan audit. Masalah utamanya adalah **pengelompokan dan urutan**, bukan banyaknya kemampuan:

- Halaman konfigurasi terkait tersebar: Cabang ada di menu utama, sedangkan Shift dan dua builder masuk ke “Pengelolaan”.
- Kategori Incident berada terpisah dari daftar Incident yang menggunakannya.
- Laporan berada di menu tambahan meskipun merupakan keluaran utama siklus shift.
- Pengaturan sistem dan Audit Log bercampur dalam kumpulan item yang sama dengan builder operasional, padahal tujuan dan frekuensi penggunaannya berbeda.
- “Pengelolaan” terlalu umum: label itu tidak membantu admin menebak isi menu.

Kesimpulannya: **navigasi perlu diringkas secara visual, bukan memangkas fitur atau menghapus halaman.**

## Struktur navigasi yang direkomendasikan

### Desktop

Sidebar yang diterapkan memakai kelompok yang jelas. Urutan dari atas:

1. **Dashboard** — ringkasan lintas cabang dan peringatan.
2. **Operasional**
   - Operasi Shift
   - Incident
   - Kategori Incident sebagai tab atau subhalaman di dalam area Incident.
3. **Laporan**
   - Daftar laporan, detail, berbagi, dan ekspor.
   - Statistik tetap kebutuhan PRD (ADM-RP-04), tetapi halaman/tab tersebut belum diimplementasikan karena metrik dan datanya memerlukan cakupan tersendiri.
4. **Konfigurasi**
   - Cabang
   - Shift
   - Checklist / SOP
   - Handover
5. **Akun**
6. **Pengaturan**
7. **Audit Log**

Kelompok navigasi ini mengelompokkan semua halaman yang ada tanpa memaksakan proses yang berbeda ke satu layar. Mode Pratinjau sebaiknya tetap berupa aksi kontekstual di area builder, bukan tautan setara dengan halaman.

### HP

Pola bottom navigation ditambah drawer diterapkan agar menu tetap mudah dijangkau:

- **Bottom navigation:** Dashboard, Operasi, Incident, Laporan, Lainnya.
- **Drawer “Lainnya”**, dengan kelompok:
  - **Konfigurasi:** Cabang, Shift, Checklist / SOP, Handover.
  - **Administrasi:** Akun, Pengaturan, Audit Log.
- Kategori Incident diakses dari area Incident.

Incident tetap diberi akses langsung di HP karena perlu ditindaklanjuti, sementara konfigurasi yang lebih jarang diubah dapat berada di drawer. Pada desktop, Operasi Shift dan Incident berada di bawah kelompok Operasional.

## Apa yang sebaiknya digabung?

### Gabungkan sebagai satu area Incident

**Daftar Incident** dan **Kategori Incident** berkaitan langsung: admin mengelola kejadian dan taksonomi yang dipakai kejadian. Jadikan satu tujuan navigasi dengan tab internal, misalnya “Daftar” dan “Kategori”. API dan URL lama dapat dipertahankan di balik navigasi baru.

### Kelompokkan, tetapi jangan jadikan satu halaman

**Cabang, Shift, Checklist/SOP, dan Handover** merupakan konfigurasi operasional. Satukan di bawah kelompok navigasi “Konfigurasi”, tetapi pertahankan masing-masing sebagai halaman atau editor tersendiri. Builder Checklist dan Handover mempunyai struktur serta interaksi yang cukup berbeda; menyatukannya menjadi satu form berisiko membuat editor padat dan membingungkan.

### Jangan digabung

- **Operasi Shift** dan **Laporan:** operasi berisi tindakan lintas cabang terhadap shift; laporan merupakan arsip hasil shift, berbagi, dan ekspor.
- **Akun** dan **Pengaturan:** pengelolaan identitas/akses berbeda dari konfigurasi perilaku sistem.
- **Pengaturan** dan **Audit Log:** pengaturan mengubah perilaku sistem; audit log bersifat baca-saja untuk penelusuran tindakan. Memisahkannya menjaga perbedaan fungsi dan tingkat kehati-hatian.
- **Shift, Checklist, dan Handover** menjadi satu editor tunggal: pengelompokan navigasi cukup, penggabungan antarmuka tidak diperlukan.

## Trade-off

| Pilihan | Keuntungan | Risiko / hal yang perlu dijaga |
|---|---|---|
| Kelompok navigasi dengan halaman terpisah | Navigasi lebih mudah dipindai; risiko perubahan data rendah; route lama tetap hidup | Membutuhkan state aktif yang benar pada submenu dan kelompok |
| Incident dan Kategori sebagai tab satu area | Kategori mudah ditemukan dari daftar yang menggunakannya | Perlu menjaga akses langsung ke URL kategori lama dan otorisasi server yang sama |
| Statistik menjadi tab Laporan | Sesuai kebutuhan ADM-RP-04 dan menyatukan cara membaca hasil operasional | Belum diterapkan; cakupan metrik, filter, dan sumber datanya perlu ditentukan terlebih dahulu |
| Memindahkan Cabang ke Konfigurasi | Membuat kelompok konfigurasi konsisten | Admin yang sering mengelola cabang memerlukan akses cepat dari Dashboard atau pintasan |

## Penerapan dan verifikasi

1. **Struktur dan label** — diterapkan mengikuti kelompok desktop dan prioritas bottom navigation HP.
2. **Shell navigasi** — `components/NavbarClient.tsx` menampilkan sidebar admin pada desktop dan bottom navigation/drawer di HP; `app/admin/layout.tsx` memberi ruang untuk sidebar. Route serta otorisasi admin dipertahankan.
3. **Area Incident** — `components/admin/incident-section-tabs.tsx` menautkan tab Daftar Incident dan Kategori. Halaman `/admin/incident` dan `/admin/kategori-incident` tetap dapat dibuka langsung.
4. **Dokumentasi** — `PLAN/PRD.md`, `PLAN/APP_FLOW.md`, `PLAN/UI-UX.md`, dan `PLAN/TESTING.md` diselaraskan. Statistik dicatat sebagai kebutuhan yang belum tersedia, bukan sebagai tab yang sudah ada.
5. **Otomatis** — typecheck, lint, build, dan pemeriksaan whitespace/diff telah dijalankan. Lint lulus dengan warning yang sudah ada di file lain.
6. **Manual** — uji browser pada desktop/HP, akses langsung route kategori, keyboard/fokus, serta drawer yang tidak menutupi aksi masih perlu dilakukan.

Perubahan ini hanya mengubah navigasi presentasi dan akses tab Incident/Kategori. Tidak ada perubahan backend, model data, atau otorisasi.

## Referensi yang diperiksa

- `components/NavbarClient.tsx` — kelompok tautan desktop dan HP yang berjalan.
- `app/admin/layout.tsx` — proteksi admin berada di layout; rekomendasi navigasi tidak mengubahnya.
- `PRD.md` S5.2 — peta navigasi admin; S7 — lingkup fungsi admin.
- `APP_FLOW.md` S6 — daftar layar admin dan kebutuhan tab Laporan/Statistik.
- `app/admin/laporan/page.tsx` — implementasi daftar laporan yang ada.
