# Plan: Draft Backup Checklist Shift

## Ringkasan

Tambahkan mekanisme draft checklist seperti Stokis, tetapi disesuaikan dengan
model shift MyCheck:

- Draft bersifat **per user + per shift instance**.
- Draft disimpan segera di `localStorage`.
- Draft dibackup ke Google Sheets melalui API.
- Saat halaman dibuka ulang, tampil modal **Lanjutkan draft** atau
  **Mulai baru**.
- Draft hanya berisi input yang belum dikirim sebagai entry.
- Draft shift lama dibersihkan ketika shift berikutnya berhasil dibuka.
- Foto yang sudah di-upload tetapi belum disubmit ikut disimpan sebagai
  metadata draft.

## Perubahan Skema Spreadsheet

### Update Spreadsheet Tanpa Manual Satu per Satu

Tidak perlu memperbarui spreadsheet cabang satu per satu secara manual.

- Template XLSX diperbarui di codebase untuk kebutuhan cabang baru.
- Spreadsheet cabang yang sudah live dimigrasikan otomatis melalui Google
  Sheets API.
- Script migrasi membaca daftar cabang dari Registry, mengecek sheet `Drafts`,
  lalu membuat sheet dan header jika belum tersedia.
- Migrasi tidak menghapus atau mengubah data existing.
- Proses migrasi wajib mendukung dry-run, backup/log hasil, dan laporan cabang
  yang gagal diproses.
- GAS digunakan sebagai fallback jika service account tidak memiliki akses
  edit ke spreadsheet tertentu atau operasi Drive tambahan diperlukan.
- Syarat eksekusi otomatis: `REGISTRY_SPREADSHEET_ID`, kredensial Google, dan
  permission Editor ke spreadsheet cabang tersedia.

Implementasi fitur draft belum boleh menganggap sheet sudah tersedia di semua
cabang. Endpoint runtime tetap menggunakan `ensureSheet` sebagai fallback,
sedangkan script migrasi digunakan untuk menyiapkan seluruh cabang secara
terkontrol sebelum fitur diaktifkan.

Tambahkan sheet flat `Drafts` ke schema dan template cabang:

```text
id
shift_instance_id
user_id
shift_date
payload
client_updated_at
created_at
updated_at
version
```

Ketentuan:

- Satu row draft untuk kombinasi `shift_instance_id + user_id`.
- `payload` berisi JSON input yang belum dikirim.
- Draft tidak dicampur ke `Entries`, karena `Entries` adalah data checklist
  yang sudah dikirim/final.
- Template XLSX dan `lib/schema/registry.ts` diperbarui dengan sheet `Drafts`.
- Cabang lama memakai `ensureSheet` saat endpoint draft pertama kali dipanggil.

## API Draft

Buat route berikut:

```text
GET    /api/shifts/[id]/draft
PUT    /api/shifts/[id]/draft
DELETE /api/shifts/[id]/draft
```

Perilaku:

- `GET` hanya mengembalikan draft user yang sedang login dan memvalidasi akses
  cabang.
- `PUT` melakukan upsert berdasarkan `shift_instance_id + user_id`.
- `PUT` memvalidasi ukuran dan struktur dasar payload.
- ID draft dibuat deterministik agar retry tidak membuat row ganda.
- `DELETE` hanya boleh menghapus draft milik user pemanggil.
- Semua endpoint menolak akses ke shift/cabang yang tidak boleh diakses user.

Payload draft:

```ts
type ShiftDraftPayload = {
  shiftInstanceId: string;
  userId: string;
  shiftDate: string;
  updatedAt: number;
  points: Record<string, {
    value?: string;
    selectedOptions?: string[];
    combinedValues?: Record<string, unknown>;
    photoIds?: string[];
  }>;
};
```

## Local Storage dan Sinkronisasi

Gunakan key:

```text
mycheck:shift-draft:{userId}:{shiftInstanceId}
```

Perilaku autosave:

- Setiap perubahan input segera disimpan ke `localStorage` dengan debounce
  singkat.
- Backup API dilakukan dengan debounce lebih panjang agar spreadsheet tidak
  ditulis pada setiap keystroke.
- Jika API gagal, draft lokal tetap dipertahankan dan UI menampilkan status
  menunggu sinkronisasi.
- Jika local draft dan cloud draft tersedia, gunakan versi dengan `updatedAt`
  terbaru.
- Local draft yang lebih baru dikirim ulang ke API.
- Jika draft kosong setelah semua item disubmit, hapus local draft dan cloud
  draft.

## Integrasi Checklist

State input yang saat ini berada di `ChecklistPointControls` perlu dapat dibaca
dan disimpan oleh `ShiftChecklistClient`.

- `ChecklistPointControls` menerima nilai draft awal.
- Setiap perubahan field memanggil callback `onDraftChange`.
- Setelah entry berhasil disubmit, hapus point tersebut dari draft.
- Jika entry dibatalkan dan kembali menjadi `belum`, point dapat dibuat menjadi
  draft lagi.
- Saat restore, draft hanya diterapkan ke point yang masih berstatus `belum`.
- Entry yang sudah ada di `Entries` selalu lebih tinggi prioritasnya daripada
  draft.

### Foto

- File binary tidak disimpan di `localStorage` atau spreadsheet.
- Foto tetap di-upload ke Drive melalui flow yang sudah ada.
- Draft hanya menyimpan `photoIds`.
- Saat restore, metadata foto dipakai kembali.
- Saat draft dibuang, foto yang hanya direferensikan oleh draft dibersihkan
  agar tidak menjadi orphan.

## Modal Restore Draft

Setelah progress shift selesai dimuat:

1. Ambil draft lokal.
2. Ambil draft spreadsheet.
3. Pilih draft dengan `updatedAt` terbaru.
4. Jika draft berisi data dan shift masih `berjalan`, tampilkan modal.

Modal menyediakan:

- Ringkasan jumlah item draft.
- Waktu terakhir draft disimpan.
- Tombol **Lanjutkan draft**.
- Tombol **Mulai baru**.

Menutup modal tanpa memilih aksi tidak menghapus draft.

Jika user memilih **Mulai baru**:

- Hapus draft dari `localStorage`.
- Hapus draft dari spreadsheet.
- Jangan menghapus `Entries` yang sudah final.
- Bersihkan foto yang hanya dimiliki draft.

Modal tidak tampil untuk shift berstatus `ditutup`, `ditutup_paksa`, atau `void`.

## Cleanup Saat Shift Berikutnya Dimulai

Modifikasi `POST /api/shifts/open`:

- Setelah shift baru berhasil dibuat atau ditemukan sebagai shift aktif, cari
  draft pada spreadsheet cabang tersebut.
- Hapus draft yang terkait shift sebelumnya dengan status `ditutup`,
  `ditutup_paksa`, atau `void`.
- Jangan menghapus draft shift yang sedang berjalan.
- Jangan menghapus draft shift aktif lain yang belum ditutup.
- Response open shift mengembalikan daftar `shift_instance_id` yang draft-nya
  dibersihkan.
- Client menghapus key `localStorage` berdasarkan daftar tersebut.
- Cleanup bersifat idempotent dan kegagalannya tidak boleh menggagalkan proses
  membuka shift.

## Test Plan

Tambahkan test dengan fake Google Sheets untuk memastikan:

- Draft dapat dibuat, dibaca, diubah, dan dihapus.
- User tidak dapat membaca atau menghapus draft user lain.
- Akses lintas cabang ditolak.
- Retry upsert tidak membuat duplicate row.
- Draft lokal dipulihkan setelah reload.
- Draft spreadsheet dipakai ketika localStorage kosong.
- Draft lokal yang lebih baru menang terhadap cloud draft.
- Entry yang sudah `selesai` tidak ditimpa draft.
- Submit entry menghapus point tersebut dari draft.
- Draft kosong otomatis dihapus.
- Cleanup hanya menghapus draft shift yang sudah ditutup.
- Cleanup tidak menghapus draft shift yang masih berjalan.
- Modal tidak muncul untuk shift tertutup.
- Foto draft dipulihkan berdasarkan `photoIds`.
- Foto draft yang dibuang tidak meninggalkan metadata orphan.

Validasi akhir:

```text
npm run typecheck
npm run lint
npm run test
npm run build
```

## Asumsi yang Dikunci

- Draft bersifat **per user + shift instance**, bukan shared antar petugas.
- Backup spreadsheet menggunakan sheet flat `Drafts`.
- Cleanup dilakukan saat shift berikutnya dibuka, bukan langsung ketika shift
  ditutup.
- Draft hanya menyimpan input yang belum dikirim ke `Entries`.
- Data yang sudah masuk `Entries` tidak pernah dianggap draft.
- Foto draft menyimpan metadata ID, bukan binary file.
- Menutup modal tanpa memilih aksi mempertahankan draft.

## Fase Redis Upstash untuk Mengurangi Rate Limit

### Tujuan

Google Sheets tetap menjadi database final dan sumber audit, tetapi tidak lagi
menjadi penyimpanan aktif untuk setiap perubahan draft atau setiap aksi
checklist. State sementara shift disimpan di Redis Upstash, kemudian dikirim ke
Sheets secara batch.

Upstash REST dipilih karena dapat digunakan melalui HTTP tanpa menambahkan
client Redis native. URL dan token hanya boleh dibaca dari environment server:

```env
UPSTASH_REDIS_REST_URL=<nilai dari environment deployment>
UPSTASH_REDIS_REST_TOKEN=<token-rahasia-baru>
```

Token tidak boleh dimasukkan ke repository, template, dokumentasi, browser,
atau log. Token yang pernah terekspos wajib di-revoke dan diganti.

### Ruang Lingkup Buffer

Redis menyimpan dua jenis data sementara:

- Draft input yang belum dikirim sebagai entry.
- Event aksi checklist aktif: `selesai`, `batal`, `skip`, dan `ubah_nilai`.

Aksi checklist memakai `client_action_id` sebagai idempotency key. Event yang
sama tidak boleh menghasilkan duplikasi pada `Entries` atau `EntryLogs`.

Upload foto tetap dilakukan melalui endpoint foto yang ada. Redis hanya
menyimpan referensi `photo_id`, bukan binary foto.

### Key dan Interface Penyimpanan

Tambahkan adapter server-side `ShiftBufferStore` dengan operasi berikut:

```ts
type ShiftBufferStore = {
  readState(shiftId: string): Promise<ShiftBufferState | null>;
  upsertDraft(shiftId: string, userId: string, draft: ShiftDraftPayload): Promise<void>;
  appendAction(shiftId: string, action: BufferedEntryAction): Promise<void>;
  flush(shiftId: string): Promise<FlushResult>;
  deleteAfterClose(shiftId: string): Promise<void>;
};
```

Gunakan namespace berversi dan scope lengkap agar data antar cabang/user tidak
tercampur:

```text
mycheck:v1:shift:{branchId}:{shiftId}:state
mycheck:v1:shift:{branchId}:{shiftId}:actions
mycheck:v1:shift:{branchId}:{shiftId}:draft:{userId}
mycheck:v1:shift:{branchId}:{shiftId}:lock
```

Gunakan TTL untuk state aktif dan retention pendek setelah shift ditutup,
misalnya beberapa hari untuk recovery. TTL harus diperpanjang hanya ketika ada
aktivitas shift yang valid.

### Alur Sinkronisasi

1. Perubahan input disimpan ke `localStorage`, lalu di-upsert ke Redis dengan
   debounce.
2. Aksi checklist divalidasi server-side terhadap snapshot shift, lalu dicatat
   sebagai event Redis dengan `client_action_id`.
3. Client menjalankan checkpoint flush setiap 15–30 detik ketika halaman aktif.
4. Server mengambil event yang belum tersinkron dalam satu batch, memvalidasi
   ulang status shift dan aturan konflik, lalu menulis perubahan ke Sheets.
5. Setelah seluruh batch berhasil, event diberi status tersinkron atau dihapus
   sesuai retention policy.
6. Saat `close shift`, input baru dihentikan, seluruh event di-drain, draft
   diselesaikan, lalu validasi item wajib, handover, report, dan status shift
   diproses seperti biasa.
7. Redis dihapus setelah penutupan dan flush berhasil. Jika flush gagal, shift
   tidak boleh dilaporkan sebagai tersimpan final.

Flush harus memakai lock singkat per `shiftId` agar checkpoint dari MyCheck,
Stokis, atau aplikasi lain tidak berjalan bersamaan. Semua aplikasi yang
menulis shift yang sama wajib menggunakan Redis bersama dan kontrak event yang
sama; Redis terpisah per aplikasi tidak mengurangi konflik maupun rate limit
Sheets.

### Perubahan Endpoint

Endpoint draft yang sudah ada tetap dipertahankan:

```text
GET    /api/shifts/[id]/draft
PUT    /api/shifts/[id]/draft
DELETE /api/shifts/[id]/draft
```

Perubahan perilaku:

- `GET` membaca Redis terlebih dahulu, lalu memakai Sheets sebagai fallback
  kompatibilitas saat migrasi.
- `PUT` menulis Redis; backup langsung ke sheet `Drafts` hanya dilakukan pada
  mode fallback atau checkpoint kompatibilitas.
- `DELETE` menghapus draft Redis dan membersihkan foto draft sesuai aturan
  existing.

Tambahkan endpoint internal:

```text
POST /api/shifts/[id]/sync
```

Endpoint ini hanya dapat dipanggil oleh service/client terautentikasi,
memvalidasi akses cabang, mengambil lock, menjalankan flush batch, dan
mengembalikan jumlah event berhasil, tertunda, serta gagal.

Tambahkan status sinkronisasi pada response progress:

```text
tersimpan_lokal
tersimpan_redis
tersinkron_sheets
gagal_sinkron
```

### Fallback dan Recovery

- Jika Redis timeout atau tidak tersedia, localStorage tetap menjadi fallback
  UI dan event dapat dikirim melalui jalur Sheets lama sementara.
- Sistem tidak boleh mengembalikan status sukses jika event belum tersimpan di
  Redis atau Sheets.
- Event gagal flush tetap berada di Redis untuk retry dengan backoff.
- Retry tidak boleh membuat duplicate `EntryLogs` karena `client_action_id`.
- Jika Redis restart, state dapat dipulihkan dari event yang masih memiliki
  retention atau dari Sheets pada checkpoint berikutnya.
- Jika proses close terputus, shift tetap `berjalan` sampai flush dan update
  `ShiftInstances` berhasil secara lengkap.

### Perubahan Skema dan Kompatibilitas

Sheet `Drafts` tetap dipertahankan untuk cabang lama, fallback, audit migrasi,
dan proses pemulihan. Tidak ada penghapusan header atau data spreadsheet pada
fase ini.

Migrasi dilakukan bertahap melalui feature flag:

1. Mode legacy: draft dan entry langsung ke Sheets.
2. Mode hybrid: draft ke Redis, Sheets sebagai fallback.
3. Mode buffered: draft dan event checklist ke Redis, flush berkala.
4. Mode final: close shift wajib melakukan drain Redis sebelum status ditutup.

Setiap migrasi atau cleanup wajib menyediakan dry-run, backup/log hasil, dan
rollback flag sesuai aturan database MyCheck.

### Pengujian Redis dan Rate Limit

Tambahkan fake Redis/Upstash adapter untuk menguji:

- Draft tersimpan dan terbaca lintas request/server instance.
- Draft tetap terisolasi antar user, shift, dan cabang.
- Event dengan `client_action_id` sama hanya diproses sekali.
- Dua user dapat mengerjakan item berbeda pada shift yang sama.
- Lock mencegah dua flush bersamaan.
- Flush batch menulis hasil yang sama dengan jalur Sheets langsung.
- Flush gagal dapat diulang tanpa duplikasi.
- Close shift menunggu seluruh event sebelum menutup shift.
- Redis tidak tersedia dan fallback legacy tetap bekerja.
- TTL menghapus state setelah retention berakhir.
- Restart Redis tidak membuat event sukses palsu.

Uji beban membandingkan jalur lama dan buffered dengan tiga aplikasi aktif.
Ukur jumlah `spreadsheets.get`, `values.get`, batch write, latency checkpoint,
jumlah retry, dan respons 429. Target fase ini adalah menghilangkan operasi
Sheets per-keystroke dan mengurangi operasi per-aksi menjadi batch checkpoint,
bukan menjadikan Redis sebagai database final.

### Asumsi Tambahan

- Upstash Redis yang sama tersedia untuk semua aplikasi yang berbagi shift.
- Credential Redis hanya tersedia di server dan deployment secret.
- Flush checkpoint menggunakan interval 15–30 detik; interval final dapat
  dikonfigurasi melalui environment.
- Google Sheets tetap authoritative untuk laporan, audit, dan arsip.
- Postgres belum diperlukan karena kebutuhan saat ini adalah state sementara;
  Postgres baru dipertimbangkan jika histori event permanen atau analitik
  jangka panjang diperlukan.
