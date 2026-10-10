# [AGENTS.md](http://AGENTS.md) MyCheck

PWA mobile-first (Bahasa Indonesia) untuk SOP shift karyawan F&amp;B. Dokumen ini aturan kerja untuk AI coding agent.

## 1. Sumber Kebenaran (urutan prioritas)

1. [PRD.md](http://PRD.md) : perilaku produk
2. DATABASE\_[SCHEMA.md](http://SCHEMA.md) : struktur data PostgreSQL
3. [TRD.md](http://TRD.md) : keputusan teknis
4. APP\_[FLOW.md](http://FLOW.md) : layar, modal, alur
5. IMPLEMENTATION\_[PLAN.md](http://PLAN.md) : urutan kerja
6. [TESTING.md](http://TESTING.md) : kriteria lulus
7. [UI-UX.md](http://UI-UX.md) : Spesifikasi UI/UX

Jika dokumen bertentangan dengan kode atau dengan instruksi, BERHENTI dan tanyakan. Jangan memilih sendiri.

## 2. Aturan Anti-Overwrite (WAJIB)

- Kerjakan SATU fase IMPLEMENTATION\_[PLAN.md](http://PLAN.md) pada satu waktu, hanya fase yang diminta.
- Sebelum menulis kode: tuliskan asumsi dan daftar file yang akan dibuat/diubah/dihapus, lalu tunggu persetujuan.
- Jangan menimpa file yang sudah ada secara utuh. Ubah dengan edit minimal (diff kecil). Jika perlu menulis ulang &gt;30% sebuah file, minta izin dulu.
- Jangan memformat ulang, mengganti nama, memindahkan, atau merapikan kode di luar lingkup tugas.
- Jangan menghapus file, fungsi, kolom, tabel, atau test tanpa izin eksplisit.
- Jangan mengubah dokumen (PRD, TRD, DATABASE\_SCHEMA, APP\_FLOW, IMPLEMENTATION\_PLAN, TESTING, AGENTS) kecuali diminta. Jika keputusan berubah, usulkan perubahan teksnya, jangan langsung menulis.
- Jangan menambah dependensi, library, atau service baru tanpa izin. Jelaskan alasannya dulu.
- Jangan membuat fitur, halaman, atau abstraksi di luar permintaan (tanpa over-engineering).
- Jangan menyentuh `.env*`, file kredensial, atau konfigurasi deploy.
- Tidak ada migrasi database. Perubahan skema = ubah header di Registry/spreadsheet cabang (lihat `lib/google/branch-schema.ts`).
- Jangan commit atau push kecuali diminta.
- Jika tugas terlalu besar, pecah dan usulkan langkah, jangan dikerjakan sekaligus.

## 3. Lingkup Produk

- Peran hanya dua: Petugas dan Admin. Penanggung Jawab (PJ) adalah status per shift, bukan peran.
- TIDAK ADA: penjadwalan, tukar shift, izin/cuti, absensi, penggajian, stok, integrasi POS, aplikasi native, multi-bahasa, 2FA, offline write queue, pembagian MVP.
- Hanya Bahasa Indonesia. Hanya PWA.
- Jangan menambah fitur yang tidak ada di PRD.

## 4. Stack

- **Single project Next.js** (App Router, TypeScript, Tailwind, shadcn/ui, Lucide) di root repo. Tidak ada monorepo, tidak ada `apps/`, tidak ada `packages/`.
- **Data: Google Sheets API**, accessed sebagai service account. Tidak ada database SQL.
  - **Registry** (`REGISTRY_SPREADSHEET_ID`) satu spreadsheet pusat, sheet ber-PascalCase:
    `Daftar_Cabang`, `Settings_Global`, `Users`, `Share_Tokens`, `Template_Referensi`.
  - **Spreadsheet per cabang** satu spreadsheet per cabang (cabang = spreadsheet, jadi tidak ada kolom `branch_id`). Sheet ber-camelCase, kolom snake_case. Sheet config: `ShiftDefinitions`, `SopCategories`, `ChecklistPoints`, `HandoverFields`, `ShiftInstances`, `Participants`, `Reports`, `Addenda`, `Summary`, `Snapshots`, `IncidentIndex`, `IncidentCategories`, `Notifications`, `_meta`.
  - Sheet transaksional memakai **tab bulanan** `<Nama>_<YYYY-MM>`: `Entries_*`, `EntryLogs_*`, `Handovers_*`, `HandoverAcks_*`, `Incidents_*`, `IncidentNotes_*`, `Photos_*`, `AuditLog_*`. `ShiftInstances.tab_month` menentukan tab mana yang dipakai sebuah instance.
- Sumber kebenaran struktur spreadsheet = **`Template_cabang_mycheck`**. Cabang baru = copy template manual di Google Drive, rename, share ke service account, lalu daftarkan `Cabang_ID`-nya di `Daftar_Cabang` (`npm run setup:branch`). Copy via API tidak dipakai (kuota Drive).
- Akses data: `lib/store.ts` (filter/list/insert/update) di atas `lib/google/sheets.ts`. Template config di `lib/admin/template-service.ts`.
- **Auth**: cookie HMAC-SHA256 (`mycheck_session`, `lib/session.ts`) + PIN **plaintext** di sheet `Users`. `lib/api-auth.ts` untuk route handler, `lib/page-auth.ts` untuk Server Component.
- Storage foto: **Google Drive** (folder dari `GOOGLE_DRIVE_FOLDER_ID`), diakses lewat route terautentikasi `/api/photos/[id]` yang mem-proxy byte.
- **Tidak ada** Redis, advisory lock, advisory transaction, `drizzle/`, Supabase, Serwist/PWA service worker, offline write queue.
- Lock & rate limiting **tidak ada** (disepakati sebagai downgrade keamanan).
- Deploy: Vercel **satu project**.
- Tema: Minimalist Corporate.

## 5. Aturan Data (Google Sheets)

- Baca/tulis **berdasarkan nama kolom** lewat `lib/store.ts`, bukan urutan. Header sheet adalah skema ubah `lib/google/branch-schema.ts` bila menambah kolom.
- **Semua tulis wajib `valueInputOption: 'RAW'`.** Dengan `USER_ENTERED`, Sheets mengurai `"2026-10-08"` menjadi serial angka `46303` dan `"true"` menjadi boolean merusak `shift_date`, `tab_month`, dan nilai centang.
- Boolean ditulis sebagai string `'TRUE'`/`FALSE` (lihat `toCellValue`).
- Kolom bool dibaca lewat `asBool()` jangan bandingkan string langsung.
- DILARANG menghapus baris secara bisnis. Hanya ubah status/is_active/void.
- Waktu disimpan sebagai string ISO UTC. Tampil sesuai zona waktu cabang.
- ID memakai ULID, dibuat di aplikasi dengan `ulid`.
- **Tidak ada transaksi.** operasi multi-sheet tidak atomik compensating action bila gagal.
- Idempotency: setiap aksi dari klien membawa `client_action_id`, dicek di `EntryLogs.client_action_id` sebelum menulis.
- **Semua operasi baca Sheet itu mahal** (1 panggilan API). Pakai cache TTL (`lib/google/cache.ts`) dan `values.batchGet` (`filterRowsMulti`) bila membaca >1 sheet.
- Mutasi ke Registry/Users **wajib** memanggil `resetRegistryCache()` / `resetUsersCache()`.
- Verifikasi PIN admin (`lib/admin/sensitive-action.ts`) **wajib** membaca sheet langsung, bukan cache supaya PIN yang baru di-reset tidak kedaluwarsa.

## 6. Aturan Bisnis Inti (penegakan + deteksi)

- BR-01: satu shift non-void per (definisi shift + tanggal + is\_test) per cabang. Dijaga oleh pengecekan di `POST /api/shifts/open` sebelum insert (tidak ada unique index di Sheets).
- BR-02: tanggal shift = tanggal saat dibuka (zona waktu cabang).
- BR-05: shift memakai snapshot template (JSON di kolom `ShiftInstances.template_snapshot`); perubahan template tidak memengaruhi shift berjalan.
- BR-12: aksi pertama pada item diterima; yang kalah mendapat "sudah diselesaikan oleh X". Dijaga oleh pengecekan state entry sebelum update (tidak ada row lock di Sheets).
- BR-14: tidak ada "centang semua".
- BR-23: penentuan waktu memakai jam server terkoreksi, bukan jam HP.
- BR-30: tutup shift hanya oleh PJ, semua item wajib selesai/skip beralasan, handover terisi.
- Setelah ditutup, shift, checklist, handover, dan laporan tidak dapat diubah lewat API. Koreksi hanya lewat addendum.
- BR-40: API tidak menghapus baris.
- BR-41: isi incident tidak dapat diedit; koreksi lewat catatan tambahan.
- BR-43: audit log append-only dengan hash chain, ditulis ke tab bulanan `AuditLog_<YYYY-MM>`. Hash chain di-reset per tab bulan (bukan global).
- Aksi sensitif admin wajib alasan + konfirmasi PIN dan tercatat di audit log.
- Admin terakhir tidak boleh dinonaktifkan atau diturunkan.

## 7. Keamanan

- Otorisasi di server pada SETIAP request: peran + akses cabang. Jangan mengandalkan penyembunyian di UI.
- Jangan pernah menaruh rahasia (SUPABASE\_SERVICE\_ROLE\_KEY, SESSION\_SECRET, PIN\_PEPPER, GOOGLE\_SA\_PRIVATE\_KEY) di kode klien, log, atau respons.
- Jangan mencatat PIN atau pin\_hash di log atau audit.
- Cookie sesi: HttpOnly, Secure, SameSite=Lax. Pasang CSRF (custom header `X-Requested-With`) dan rate limiting.
- Validasi semua input di server dengan Zod.
- Pesan galat ke pengguna tidak membocorkan detail database/Google.
- Foto disajikan lewat route API `/api/photos/[id]` yang memeriksa akses cabang lalu mem-proxy byte dari Drive. Jangan pernah memberi tautan langsung ke Drive.

## 8. Gaya Kode

- TypeScript strict. Tanpa `any` tanpa alasan tertulis.
- Ikuti pola yang sudah ada di repo sebelum membuat pola baru.
- Fungsi kecil, tanpa abstraksi spekulatif.
- Komentar minimal; hanya untuk "mengapa", bukan "apa".
- Teks antarmuka Bahasa Indonesia, singkat dan lugas.
- UI: mobile-first, target sentuh minimal 48px, teks dasar 16px, status tidak hanya dengan warna (sertakan ikon + teks), gunakan komponen shadcn yang sudah ada sebelum membuat komponen baru.
- Drawer untuk modal di HP, Dialog di desktop.

## 9. Cara Bekerja

1. Baca dokumen yang relevan dengan tugas, ringkas pemahaman Anda dalam beberapa baris.
2. Sebutkan kontradiksi, informasi yang hilang, dan asumsi. Tanyakan jika ada keputusan terbuka (lihat bagian 11).
3. Usulkan rencana + daftar file. Tunggu persetujuan.
4. Implementasikan hanya yang disetujui.
5. Jalankan pemeriksaan relevan dari [TESTING.md](http://TESTING.md).
6. Laporkan: apa yang diubah, apa yang diuji, apa yang BELUM terverifikasi.

## 10. Pengujian dan Pelaporan

- Jangan menandai sesuatu lulus kecuali benar-benar dijalankan atau diverifikasi.
- Pisahkan: \[Otomatis\] dan \[Manual\] untuk pengguna.
- Uji konkurensi (BR-01, BR-12) dengan dua akun/permintaan paralel, bukan satu alur.
- Jika tes gagal, laporkan apa adanya (Tes, Diharapkan, Aktual, Langkah). Jangan melemahkan atau menghapus tes agar lulus.
- Jangan mengklaim "aman" tanpa menyebut apa yang diperiksa.

## 11. Keputusan Terbuka (JANGAN diputuskan sendiri, tanyakan)

- Apakah severity incident dipakai (kolom opsional sudah ada di schema).
- Target skala dan metrik keberhasilan numerik final (PRD §12).
- Apakah web push diimplementasikan di Fase awal atau belakangan.
- Akordeon vs tab untuk Kategori SOP; apakah admin memakai HP.

## 12. Perintah

Semua perintah dijalankan dari root repo (`mycheck/`).

- Install: `npm install`
- Dev: `npm run dev` (default `:3000`)
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Inisialisasi Registry: `npm run setup:registry`
- Daftarkan cabang: `npm run setup:branch -- <Cabang_ID> <Nama> <Spreadsheet_ID> [Timezone] [Kode]`
- Buat admin pertama: `npm run seed:admin`

Catatan: `npm run build` di mesin dengan RAM < 4GB perlu
`NODE_OPTIONS="--max-old-space-size=3072"`.

## 13. Saat Ragu

Tanyakan, jangan menebak. Lebih baik satu pertanyaan singkat daripada perubahan besar yang salah.

## 14. Lakukan commit dan push berkala.

