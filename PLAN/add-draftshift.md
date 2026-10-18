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
