# Rencana: Photo Evidence di Google Drive via Google Apps Script

> **Status dokumen:** RENCANA. Belum ada implementasi.
>
> Legenda status yang dipakai di dokumen ini:
>
> - **\[SAH\]** — fakta terverifikasi di source code atau API Google saat dokumen ditulis
> - **\[RENCANA\]** — yang hendak dikerjakan
> - **\[BELUM DIUJI\]** — belum dijalankan/diuji, jangan dianggap lulus

---

## 0. Ringkasan

Upload foto evidence saat ini **tidak pernah berhasil** karena service account
tidak memiliki kuota storage Google Drive. Rencana ini menyelesaikan itu dengan
memindahkan penulisan file ke Google Apps Script (GAS) yang berjalan di bawah
akun Google manusia, sekaligus merapikan struktur folder cabang dan mengubah
tampilan foto di laporan dari gambar inline menjadi tautan.

| #   | Keputusan                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- |
| 1   | Pembuatan cabang menghasilkan satu **folder cabang** di Drive yang memuat spreadsheet cabang + folder `Evidence/`. Ketiga ID disimpan di REGISTRY. |
| 2   | Struktur folder cabang dibuat **GAS dalam satu panggilan** bersama salinan spreadsheet, agar tidak ada keadaan setengah jadi. |
| 3   | Foto **boleh diakses publik** lewat `Anyone with the link: viewer`. |
| 4   | GAS dideploy sebagai **Execute as: `taufikalwan47@gmail.com`**, **Access: Anyone**. |
| 5   | Foto di laporan ditampilkan sebagai **tombol** menuju link Drive — bukan gambar inline. Berlaku untuk foto checklist, handover, dan incident. |
| 6   | Format berkas: WebP, maks 1600 px, target ≤150 KB.                                                 |
| 7   | Nama berkas: `[KODE_CABANG]-[tgl]-[slot]-[user]-[urutan].webp`, contoh `CBGBDG01-16102026-pagi-dea-1.webp`. |
| 8   | `[slot]` **diturunkan dari `start_time`** shift definition, bukan dari nama shift.                  |
| 9   | Spreadsheet cabang **ikut dibuat otomatis** lewat GAS (menyalin template).                         |
| 10  | Cabang `CBGBDG01` yang sudah ada **dirapikan** ke struktur baru.                                      |

---

## 1. Analisis Kondisi Saat Ini

### 1.1 Akar kegagalan upload: kuota service account = 0 \[SAH\]

Diuji langsung ke Drive API:

```
storageQuota: { "limit": "0", "usage": "0", ... }
```

Galat yang dilempar:

```
Error: Service Accounts do not have storage quota.
Leverage shared drives, or use OAuth delegation instead.
    at async (app/api/photos/upload/route.ts:206:15)
```

Ini perilaku bawaan Google untuk seluruh service account, **bukan** miskonfigurasi
env yang bisa diperbaiki. Konsekuensinya: `drive.files.create` untuk berkas
selalu gagal.

### 1.2 Hanya sebagian operasi Drive yang berhasil — dan itu menyesatkan \[SAH\]

| Operasi Drive                          | Hasil | Catatan                                     |
| -------------------------------------- | ----- | ------------------------------------------- |
| `files.get` / `files.list` (baca)      | ✅    | Service account punya akses baca            |
| `files.create` (**folder**)            | ✅    | Folder tidak menyimpan byte                 |
| `files.create` (**berkas**)            | ❌    | Butuh kuota                                 |

Folder `MyCheck - CBGBDG01` **dimiliki** oleh service account, sehingga terlihat
"sudah dikonfigurasi benar", padahal tidak ada satu pun foto yang bisa masuk.
Bukti: sheet `Photos` kosong di semua tab bulanan (2026-09/10/11), dan folder
cabang berisi 0 berkas.

### 1.3 Galat tidak tertangani → HTTP 500 tanpa body \[SAH\]

`route.ts:206` dibungkus `try` hanya untuk `ensureBranchPhotoFolder`, sedangkan
`drive.files.create` tidak. Exception-nya lepas ke handler Next.js, jadi
klien menerima **500 dengan body kosong**. Di sisi klien:

```ts
// lib/upload-photo.ts:44
const result = JSON.parse(xhr.responseText);   // body kosong → lempar
// → reject(new Error('Upload gagal: respons server tidak valid'))
```

Pesan yang tampil ke pengguna **menyesesatkan** — penyebab sebenarnya tidak
pernah sampai ke UI.

### 1.4 Struktur Drive sekarang: saudara, bukan bersarang \[SAH\]

```
CHECKLIST-APP                       (root, owner taufikalwan47@gmail.com)
├── RESGISTRY_MYCHECK                (spreadsheet)
├── CBGBDG01 - Bandung                (spreadsheet)   ← belum di dalam folder cabang
└── MyCheck - CBGBDG01                (folder, owner service account)
```

Target:

```
CHECKLIST-APP
└── MyCheck - CBGBDG01                (folder cabang)
    ├── CBGBDG01 - Bandung            (spreadsheet cabang)
    └── Evidence                      (folder foto)
```

### 1.5 Skema REGISTRY sekarang \[SAH\]

`Daftar_Cabang`:

```
Cabang_ID | Nama_Cabang | Kode | Timezone | Spreadsheet_ID | Folder_Drive_ID | Aktif | Alamat
```

- `Kode` sudah ada → `[KODE_CABANG]` pada nama berkas tidak perlu kolom baru.
- **Belum ada** kolom untuk folder evidence → perlu `Evidence_Folder_ID`.
- `Folder_Drive_ID` saat ini berisi ID folder **evidence/photo**, bukan folder
  cabang. plans ini menggeser maknanya menjadi folder cabang, dan folder
  evidence pindah ke kolom baru.

### 1.6 Bug laten pada pembuatan cabang \[SAH\]

```ts
// app/api/admin/branches/route.ts:11
const folderDriveId = () => process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

// app/api/admin/branches/route.ts:87
Folder_Drive_ID: folderDriveId(),
```

Cabang baru diisi dengan **ID folder ROOT** (`CHECKLIST-APP`), bukan folder
cabangnya sendiri. Tidak berbahaya selama ini karena tidak terlihat, tetapi
akan salah begitu folder evidence mulai dibaca dari kolom itu.

### 1.7 Pembuatan spreadsheet cabang masih manual \[SAH\]

```ts
// app/api/admin/branches/route.ts:85-88
// Spreadsheet cabang dibuat manual (copy template) lalu diisi di sini.
Spreadsheet_ID: '',
Aktif: false, // aktif setelah Spreadsheet_ID diisi & di-share ke service account
```

Menyalin berkas template adalah operasi **berkas**, sehingga tidak bisa dilakukan
service account — harus lewat GAS.

### 1.8 WebP sudah ada, tapi hanya di 1 dari 3 jalur \[SAH\]

`compressPhoto()` di `components/shift/checklist-point-controls.tsx:44` sudah
mengerjakan: resize maks 1600 px, WebP quality ladder `0.82→0.28`, target
≤150 KB, gagal bila browser tidak mendukung WebP.

| Jalur upload                     | Memakai `compressPhoto`?         |
| -------------------------------- | ------------------------------- |
| `checklist-point-controls.tsx`   | ✅ ya                            |
| `shift-close-dialog.tsx` (handover) | ❌ kirim berkas mentah         |
| `incident-create-form.tsx`       | ❌ kirim berkas mentah            |

Artinya **tidak perlu dependency baru** — cukup memindahkan fungsi ke modul
bersama.

### 1.9 Foto di laporan sekarang di-proxy, bukan tautan Drive \[SAH\]

```tsx
// components/report/report-detail.tsx:118-121
photos: (result.photos ?? []).map((photo) => ({
  ...photo,
  src: `/api/photos/${encodeURIComponent(photo.id)}?reportId=...`,
})),

// components/report/public-report-view.tsx:244-246
<img src={photo.src} alt={...} />
```

`Photos[].fileRef` sudah berisi ID berkas Drive, jadi tautan Drive dapat
dibentuk tanpa perubahan pada server.

### 1.10 GAS stokis sebagai referensi — dan statusnya sekarang \[SAH\]

Stokis pernah membangun pola yang sama persis:

- `stokis/lib/appsscript.ts:137` — `uploadFileToGASDrive()` sisi Next.js
- `stokis/apps-script/PDF.js:203` — `uploadFileToDrive()` sisi GAS
- Autentikasi `x-api-key` dengan perbandingan constant-time (`Code.js:27`,
  `secureKeyEqual_`)

**Namun deployment stokis sekarang tidak dapat dipanggil.** Diuji:

```
HTTP 405 — "Maaf, saat ini tidak dapat membuka file."
```

Service account stokis juga punya `quota limit = 0` dan **0 berkas**. Jadi GAS
stokis adalah pola yang benar secara desain, tetapi **tidak dapat dipakai
utuh** — polanya harus ditulis ulang.

---

## 2. Prasyarat yang Sudah Terverifikasi \[SAH\]

Sebelum implementasi, hal-hal berikut sudah diperiksa dan hasilnya mendukung:

| Pemeriksaan                                                | Hasil                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Akun `taufikalwan47@gmail.com` memiliki `storageQuota`      | 15 GB kuota personal — cukup                                                             |
| Akun tersebut **owner** `Template_cabang_mycheck`           | ✅ GAS boleh menyalin template                                                            |
| Template ada di bawah `CHECKLIST-APP`                        | ✅ sesuai allowlist                                                                       |
| Template punya 22 sheet, semua cocok `branch-schema.ts`      | ✅ tidak ada sheet yang hilang                                                            |
| Service account **boleh membuat folder**                     | ✅ (folder `MyCheck - CBGBDG01` dibuat olehnya)                                          |
| Service account **tidak boleh menyalin berkas**              | ❌ butuh GAS                                                                              |
| Izin `anyoneWithLink: writer` pada ROOT dan CABANG           | ⚠️ perlu dibersihkan — lihatS12                                                          |

> Catatan: izin `Anyone with the link` pada **folder** tidak otomatis berlaku
> ke berkas di dalamnya. Setiap foto tetap perlu di-share eksplisit, dan GAS
> melakukannya secara eksplisit (§3.3).

---

## 3. Fase A — Kode GAS \[RENCANA\]

Deliverable: dua berkas `.gs` + `appsscript.json` untuk di-deploy manual oleh
pengguna. **Tidak ada perubahan kode MyCheck di fase ini.**

### 3.1 Kontrak API

Satu endpoint `POST /exec` dengan body `text/plain` berisi JSON.

#### Action `createBranchStructure`

```jsonc
// request
{ "action": "createBranchStructure", "x-api-key": "<key>",
  "payload": { "branchCode": "CBGBDG02", "branchName": "Cabang Bandung Barat" } }

// response
{ "success": true,
  "data": { "folderId": "...", "spreadsheetId": "...", "evidenceFolderId": "..." } }
```

Langkah di dalam GAS:

1. Validasi `branchCode` cocok `^[A-Z0-9-]{2,20}$`
2. Validasi `branchName` ≤ 120 karakter, tanpa karakter kontrol
3. Buat folder `{branchCode} - {branchName}` di dalam root allowlist
4. `DriveApp.getFileById(TEMPLATE_ID).makeCopy(nameSpreadsheet, folder)`
5. Buat subfolder `Evidence` di dalam folder tadi
6. Share spreadsheet baru ke service account (`addEditor`)
7. Kembalikan ketiga ID

> **Kenapa GAS yang membuat folder, padahal service account bisa?**
> Service account memang bisa membuat folder (§1.2), jadi secara teknis
> memungkinkan. Tapi langkah 4 — menyalin template — hanya bisa dilakukan GAS.
> Memecahnya jadi "Next.js buat folder, lalu GAS salin spreadsheet" membuka
> keadaan setengah jadi: folder ada tapi spreadsheet gagal. Satu panggilan GAS
> menghindari itu.
>
> `ensureBranchPhotoFolder()` yang berbasis service account **tetap dipertahankan**
> sebagai fallback untuk cabang lama yang belum punya `Evidence_Folder_ID`
> (§7.4).

#### Action `uploadPhoto`

```jsonc
// request
{ "action": "uploadPhoto", "x-api-key": "<key>",
  "payload": { "folderId": "...", "fileName": "CBGBDG01-16102026-pagi-dea-1.webp",
               "mimeType": "image/webp", "fileBase64": "..." } }

// response
{ "success": true,
  "data": { "fileId": "...", "fileUrl": "https://drive.google.com/file/d/.../view",
            "fileName": "CBGBDG01-16102026-pagi-dea-1.webp", "sizeBytes": 123456 } }
```

### 3.2 Autentikasi

- API key disimpan di **Script Properties** (`MYCHECK_API_KEY`), bukan hardcoded.
- Bandingkan dengan constant-time (`secureKeyEqual_`), dan **fail closed** —
  tanpa key berarti request ditolak, tanpa efek samping.
- Log setiap attempt (sukses/gagal) memakai `Logger` dengan timestamp, action,
  dan hasil, **tanpa** isi key maupun isi berkas.

### 3.3 Hardening di dalam GAS (wajib — endpoint-nya publik)

| Ancaman                                                            | Pen countermeasures                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `folderId` berbahaya — pemanggil menulis ke folder mana pun         | Tolak bila `folder.getParents()` tidak memuat root allowlist                            |
| Berkas berbahaya diunggah                                           | MIME allowlist + batas ukuran                                                            |
| Nama berkas menyisipkan path traversal (`../../`)                   | Validasi `filename` regex ketat; Basque-nama selalu                                    |
| Key bocor                                                             | Semua operasi tetap tervalidasi allowlist; key hanya memberi akses ke subtree `CHECKLIST-APP` |
| Folder parent dibangun sendiri oleh pemanggil                        | `createBranchStructure` selalu membuat di bawah root allowlist                          |

Rincian:

- **Allowlist root**: `ALLOWED_ROOT_IDS` Script Property. `folderId` ditolak
  kecuali salah satu induknya ada di daftar itu.
- **MIME**: hanya `image/webp`, `image/png`, `image/jpeg`.
- **Ukuran**: hasil decode base64 ≤ 5 MB. Karena base64 menambah ~33%, request
  ±6,7 MB — masih jauh di bawah batas GAS.
- **Nama berkas**: `^[A-Z0-9][A-Z0-9._-]{0,120}\.(webp|png|jpg|jpeg)$`. Ditolak
  bila tidak cocok. Tidak pernah dipakai sebagai path.
- **Sharing**: setiap foto di-set `DriveApp.Access.ANYONE_WITH_LINK` +
  `DriveApp.Permission.VIEW`, sesuai keputusanS0 no. 3.
- **Anti-tabrakan**: bila nama berkas sudah ada di folder, GAS menambah
  `-2`, `-3`, dst. sebelum menyimpan. Ini jaring pengaman; penomoran utama
  dibuat di sisi Next.js (§7.1).

### 3.4 Script Properties yang perlu diisi

| Properti           | Nilai / cara                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| `MYCHECK_API_KEY`  | Dibuat oleh `SetKey.gs` (prefix `myc_` + UUID tanpa tanda hubung)              |
| `ALLOWED_ROOT_IDS` | Dipisah koma; default `1fBD-OjYUUYA509JHdOF2xOB_ICMBr4b-` (CHECKLIST-APP)       |
| `TEMPLATE_SHEET_ID`| ID `Template_cabang_mycheck` yang sudah tercatat di REGISTRY                   |
| `SA_EMAIL`         | Email service account, untuk `addEditor` saat spreadsheet cabang disalin        |

### 3.5 Langkah deploy (manual, oleh pengguna)

1. Buat project Apps Script baru.
2. Tempel `Code.gs` dan `SetKey.gs`, isi `appsscript.json`.
3. Isi Script Properties `TEMPLATE_SHEET_ID`, `ALLOWED_ROOT_IDS`, `SA_EMAIL`.
4. Jalankan `SetKey` sekali → catat API key.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me (`taufikalwan47@gmail.com`)**
   - Who has access: **Anyone**
6. Kirim URL `/exec` ke pengembang.

---

## 4. Fase B — REGISTRY \[RENCANA\]

Kolom baru: **`Evidence_Folder_ID`**, ditambahkan **di akhir** agar kolom lama
tidak bergeser — pola yang sama sudah dipakai untuk `Alamat`
(`registry-admin.ts:54-56`).

| Berkas                            | Perubahan                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `lib/google/registry.ts`          | Tambah `Evidence_Folder_ID?: string` pada `CabangRecord`                        |
| `lib/google/registry-admin.ts`   | Tambah `'Evidence_Folder_ID'` di akhir `CABANG_HEADERS`                          |
| `lib/google/registry-admin.ts`   | `updateCabangEvidenceFolderId(cabangId, folderId)` — pola sama dengan `updateCabangFolderId` |
| Registry (live)                   | Tambah header kolom kosong; **tidak** mengubah nilai baris yang ada              |

Tabel `Daftar_Cabang` di REGISTRY setelah perubahan:

```
Cabang_ID | Nama_Cabang | Kode | Timezone | Spreadsheet_ID | Folder_Drive_ID | Aktif | Alamat | Evidence_Folder_ID
```

> `Folder_Drive_ID` berubah makna: dari "folder foto" menjadi "folder cabang".
> Hanya satu baris (CBGBDG01) yang impacted, dan ia dimigrasi di Fase D.

---

## 5. Fase C — Alur Pembuatan Cabang \[RENCANA\]

`POST /api/admin/branches` berubah dari "tulis baris Registry" menjadi
"minta GAS membuat struktur, lalu tulis Registry".

```
1. Validasi body (Zod, tidak berubah)
2. Cek kode cabang belum dipakai
3. → GAS createBranchStructure({branchCode, branchName})
4. Tulis Registry:
     Spreadsheet_ID     = spreadsheetId
     Folder_Drive_ID    = folderId          ← fix bug latenS1.6
     Evidence_Folder_ID = evidenceFolderId
     Aktif              = true              ← spreadsheet sudah di-share ke SA oleh GAS
5. Response ke UI menampilkan ketiga ID
```

Konsekuensi `Aktif`:

- Sebelumnya admin harus mengisi `Spreadsheet_ID` manual lalu menyalakan cabang.
- Sekarang GAS sudah share spreadsheet ke service account, sehingga `Aktif`
  bisa langsung `true`.
- **Tetap ada fallback**: kalau GAS gagal, cabang **tidak boleh** dibuat
  separuh. Sifat penting Sheets: operasi multi-sheet bisa gagal sebagian.
  Karena itu spreadsheet lebih dulu dibuat (GAS), baru Registry ditulis —
  bila penulisan Registry gagal, spreadsheet yatim ada di Drive dan harus
  dilaporkan sebagai *"cabang dibuat di Drive tapi gagal didaftarkan"*, bukan
  disembunyikan.

---

## 6. Fase D — Migrasi Cabang `CBGBDG01` \[RENCANA\]

Sekali, dikerjakan manual dengan cadangan.

| Langkah | Aksi                                                                                   |
| ------- | -------------------------------------------------------------------------------------- |
| 0       | Cadangkan Registry (export CSV) dan catat ID lama kedua folder                          |
| 1       | Buat folder `Evidence` di dalam `MyCheck - CBGBDG01`                                   |
| 2       | Pindahkan spreadsheet `CBGBDG01 - Bandung` ke dalam folder cabang                       |
| 3       | Tulis `Evidence_Folder_ID` ke Registry                                                 |
| 4       | Pastikan `Folder_Drive_ID` menunjuk ke folder cabang (bukan root)                        |
| 5       | Uji: spreadsheet masih terbaca service account; upload foto tetap 409 bila shift tertutup |
| 6       | Persempit `anyoneWithLink: writer` menjadi editor eksplisit untuk SA (§12)              |

> Moving berkas di Drive **tidak** memutus permission yang sudah diberikan.
> `canAddChildren` dan akses baca tetap berlaku — tapi wajib diuji pada langkah 5.

---

## 7. Fase E — Klien GAS & Upload Foto \[RENCANA\]

### 7.1 Nama berkas

Fungsi murni (unit-testable), misalnya `lib/photo-filename.ts`:

```ts
buildPhotoFileName({ branchCode, shiftDate, startTime, username, seq })
// → "CBGBDG01-16102026-pagi-dea-1.webp"
```

Aturan:

| Bagian        | Sumber                                        | Format / aturan                                              |
| ------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `[KODE_CABANG]` | REGISTRY `Kode`                              | Huruf besar; buang karakter di luar `[A-Z0-9-]`; fallback `umum` |
| `[tgl]`       | `ShiftInstances.shift_date`                   | `DDMMYYYY`; fallback ke tanggal hari ini **timezone cabang** |
| `[slot]`      | `ShiftDefinitions.start_time`                 | Lihat tabelS7.2                                            |
| `[user]`      | session user `username`                       | Huruf kecil; buang karakter di luar `[a-z0-9._-]`; fallback `unknown` |
| `[urutan]`    | jumlah foto pada grup yang sama + 1           | Mulai 1                                                      |

### 7.2 Penurunan `[slot]` dari jam

DecisionS0 no. 8. Bucket dari `start_time` shift definition, lima rentang
tanpa tumpang tindih dan menutup penuh 00:00–23:59:

| `start_time` | `slot`  |
| ------------ | ------- |
| 00:00–05:59  | `malam` |
| 06:00–10:59  | `pagi`  |
| 11:00–14:59  | `siang` |
| 15:00–18:59  | `sore`  |
| 19:00–23:59  | `malam` |

Fallback ke `umum` bila:

- shift tidak punya shift definition (foto incident di luar shift), atau
- `start_time` kosong/tidak bisa diparse.

**Kesesuaian dengan data sekarang** \[SAH\]: dua shift aktif adalah
`Shift Pagi` (07:00) dan `Shift Siang` (12:00) → menghasilkan `pagi` dan `siang`,
sesuai contoh. Nama lama seperti `T1f4 Pagi 428190` (00:00–23:59) menghasilkan
`malam` — intentional, karena nama tidak lagi dipakai sebagai sumber.

> **Keterbatasan yang harus disadari:** dua shift dengan bucket jam sama dan
> petugas yang sama pada tanggal yang sama akan menghasilkan nama yang
> berbeda hanya lewat `[urutan]`. Karena `[urutan]` ditulis berurutan per grup,
> nama tetap unik — tetapi dari sisi membaca nama berkas, orang tidak bisa
> pasti shift mana. Ini konsekuensi langsung dari keputusan "turunkan dari jam".

### 7.3 Klien GAS

| Berkas                          | Isi                                                              |
| ------------------------------- | ---------------------------------------------------------------- |
| `lib/google/gas-client.ts`      | `callGas(action, payload)` — POST JSON, header `Content-Type: text/plain`, kirim `x-api-key` |
| `lib/google/photo-upload-gas.ts` | Bungkus `uploadPhoto`, penanganan galat eksplisit di setiap jalur |

Environment baru (nilai tidak pernah ditulis di dokumentasi ini):

```
MYCHECK_GAS_URL       # URL /exec dari GAS
MYCHECK_GAS_API_KEY   # nilai dari SetKey
```

> **`STOKIS_API_KEY` tidak boleh disentuh** — variabel itu adalah signing key
> session (`lib/session.ts:9`). Mengubahnya akan membatalkan seluruh sesi yang
> sedang berjalan.

### 7.4 Mengganti route upload

`app/api/photos/upload/route.ts:200-215` — blok `drive.files.create` diganti
panggilan GAS:

```ts
// SEBELUM — gagal dengan quota error
const res = await drive.files.create({ ... });

// SESUDAH
const folderId = evidenceFolderId ?? (await ensureBranchPhotoFolder(branchId));
const uploaded = await uploadPhotoViaGas({
  folderId,                      // dari REGISTRY; fallback ke ensureBranchPhotoFolder
  fileName: buildPhotoFileName(...),
  mimeType: file.type,
  buffer,
});
```

Fallback `ensureBranchPhotoFolder` hanya untuk cabang lama yang `Evidence_Folder_ID`-nya
masih kosong. Setelah migrasi (§6) cabang normal selalu punya kolom terisi.

Sisa alur (validasi, batas jumlah foto, penulisan baris `Photos`) tidak
berubah — `ensureMonthlySheet` dipanggil tepat seperti sekarang, dan tab
`Photos` tetap dipakai sebagai metadata.

### 7.5 Pemetaan error

Exception yang tidak tertangani **dilarang** lolos sebagai 500 kosong.

| Kondisi                              | HTTP | Pesan ke pengguna                         |
| ------------------------------------ | ---- | ----------------------------------------- |
| Key ditolak GAS                      | 502  | "Konfigurasi server tidak valid."         |
| Folder bukan anak root allowlist     | 502  | "Folder penyimpanan tidak dikenali."      |
| MIME/size tidak valid                | 400  | Pesan spesifik (sudah ada)                |
| Shift bukan `berjalan`               | 409  | Pesan yang sudah ada                       |
| Kuota akun GAS habis                 | 507  | "Penyimpanan foto sedang penuh."          |
| Gagal lain / timeout                 | 502  | "Foto gagal disimpan. Coba lagi."         |

Semua kondisi non-2xx dari GAS dipetakan, bukan diteruskan mentah.

---

## 8. Fase F — WebP di Semua Jalur \[RENCANA\]

| Langkah | Berkas                                                          |
| ------- | --------------------------------------------------------------- |
| 1       | Pindahkan `compressPhoto` ke `lib/photo-compress.ts` (modul klien) |
| 2       | `checklist-point-controls.tsx` mengimpor dari sana               |
| 3       | `shift-close-dialog.tsx` (handover) memakai `compressPhoto`       |
| 4       | `incident-create-form.tsx` memakai `compressPhoto`               |
| 5       | `upload-photo.ts` menolak berkas non-WebP sebagai jaring pengaman  |

Batas 5 MB di server tetap sebagai jaring pengaman; sumber sampai 15 MB
diperbolehkan kompresi sisi klien (sesuai perilaku sekarang).

---

## 9. Fase G — Tampilan Laporan \[RENCANA\]

`components/report/public-report-view.tsx:241-253` — ganti `<figure><img>` dengan
tombol:

```
[Cek bukti foto]  →  https://drive.google.com/file/d/{fileRef}/view
```

- Berlaku untuk `ownerType` `entry`, `handover`, **dan** `incident`
  (sesuai keputusanS0 no. 5).
- `photos[].src` (proxy `/api/photos/[id]`) tidak lagi dipakai di laporan.
- Endpoint `/api/photos/[id]` **dipertahankan** — masih berguna untuk
  pratinjau terautentikasi di halaman lain. Perlu audit saat implementasi
  untuk memastikan tidak ada pemakai `src` lain yang ikut hilang.
- Tombol membuka tab baru (`target="_blank" rel="noreferrer"`).
- Label tombol memuat konteks: nama point untuk checklist, nama field untuk
  handover, atau "Incident" — memakai pemetaan yang sudah ada di komponen
  (`pointTitleByRef`).
- Foto yang tidak lolos filter `attachedPhotos` yang sudah ada tetap disembunyikan.

Karena foto sekarang `Anyone with the link: viewer`, pembaca laporan publik
(`/r/[token]`) bisa membuka tautan tanpa login. Ini konsekuensi yang disetujui;
dicatat diS12.

---

## 10. Fase H — Test \[RENCANA\]

Repo tidak punya uji komponen React, jadi fokusnya pada logika murni dan route.

| Berkas uji                    | Cakupan                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `tests/photo-filename.test.ts`| Format `DDMMYYYY`, kelima bucket jam, sanitasi KODE/username, fallback `umum`/`unknown`, urutan, karakter terlarang |
| `tests/gas-client.test.ts`    | Body & header benar, pemetaan status GAS → error Next.js (401/403/413/500/timeout), tidak pernah melempar `undefined` |
| `tests/registry-evidence.test.ts` | `Evidence_Folder_ID` ada di `CABANG_HEADERS` di posisi terakhir; `updateCabangEvidenceFolderId` menulis ke kolom benar |
| `tests/branch-create.test.ts` | `POST /api/admin/branches` memanggil GAS dan menyimpan ketiga ID; gagal GAS tidak menulis Registry separuh |

Verifikasi yang **tidak** bisa dibuktikan oleh test dan wajib dijalankan manual
(§14).

---

## 11. Urutan Eksekusi & Dependensi

```
  Fase A  GAS (ditulis manual oleh pengguna)   ← BLOCKER TOTAL
    │
    └── deploy + kirim URL
              │
              ▼
  Fase B  REGISTRY: kolom Evidence_Folder_ID
              │
              ▼
  Fase C  POST /api/admin/branches → GAS createBranchStructure
              │
              ▼
  Fase D  migrasi CBGBDG01 ke struktur baru
              │
              ▼
  Fase E  klien GAS + upload foto        ──►  Fase F  WebP semua jalur
              │                                        │
              └────────────────┬───────────────────────┘
                               ▼
                        Fase G  tombol tautan Drive di laporan

  Fase H  test ditulis berdampingan dengan tiap fase,
          bukan dikumpulkan di akhir.
```

Fase A adalah blocker total: tanpa URL GAS, C/E/D tidak bisa dijalankan.
Test (Fase H) ditulis berdampingan dengan tiap fase, bukan di akhir.

---

## 12. Risiko & Batasan \[RENCANA\]

1. **Foto menjadi publik.** Sesuai keputusanS0 no. 3, setiap foto diberi
   `Anyone with the link: viewer`. ID berkas Drive acak dan tidak dapat ditebak,
   jadi risikonya "orang yang punya tautan", bukan "publik searchable".
   Walaupun begitu, laporan `/r/[token]` bisa dibagikan ke pihak ketiga, jadi
   tautan foto ikut tersebar. Diterima secara sadar.
2. **Akun GAS adalah akun personal.** `taufikalwan47@gmail.com` adalah gmail
  pribadi dengan kuota 15 GB. Kalau akun itu dihapus, semua foto ikut hilang.
   Tidak ada redundansi.
3. **GAS adalah titik kegagalan tunggal.** Tidak ada retry otomatis; sheet
   `Photos` bisa punya baris menunjuk `file_ref` yang gagal diunggah. Perlu
  QoS/reconciliation berkala (di luar lingkup,S13).
4. **`anyoneWithLink: writer` pada ROOT dan CABANG** — izin ini memberi hak
   menulis ke siapa pun yang punya link folder, dan **tidak** diperlukan lagi
   setelah folder dibuat ulang. Perlu dibersihkan (§6 langkah 6).
5. **Bucket jam dapat menyesatkan** bila ada dua shift dengan jam mulai
   berdekatan (§7.2).
6. **Tidak ada transaksi lintas Google.** Pembuatan cabang bisa menyisakan
   spreadsheet yatim di Drive bila penulisan Registry gagal (§5).
7. **Biaya.** Setiap upload GAS memakai kuota Drive akun tersebut.

---

## 13. Di Luar Lingkup \[RENCANA\]

Hal berikut **tidak** dikerjakan dalam rencana ini; dicatat agar tidak dianggap
sudah ada:

- Rekonsiliasi/`Photos` ↔ Drive secara berkala
- Unggah banyak berkas (multi-file) per aksi
- Kompresi video atau dokumen
- Rotasi/hapus foto lama
- Mengganti Drive untuk penyimpanan lain (S3, Supabase Storage)
- Audit Trail untuk perubahan izin Drive
- Pembersihan `anyoneWithLink` pada spreadsheet/berkas lain di luar folder
  MyCheck

---

## 14. Checklist Verifikasi Manual \[BELUM DIUJI\]

Tidak ada satu pun item di bawah ini yang sudah dijalankan. Jangan menyatakan
lulus tanpa menjalankannya.

**A. GAS**
- [ ] `createBranchStructure` membuat folder + salinan spreadsheet + `Evidence`
- [ ] Spreadsheet hasil salinan terbaca service account (`Spreadsheet_ID` terisi, sheet terbaca)
- [ ] Folder di luar root allowlist ditolak
- [ ] MIME di luar allowlist ditolak
- [ ] Berkas > 5 MB ditolak
- [ ] Nama berkas tidak valid ditolak
- [ ] Tabrakan nama berkas menghasilkan `-2`, `-3`, dst
- [ ] API key salah ditolak, dan tidak ada operasi yang terjadi
- [ ] Foto ter-set `Anyone with the link: viewer`

**B. Pembuatan cabang (lingkup baru)**
- [ ] Cabang uji dibuat; ketiga ID masuk Registry
- [ ] `Folder_Drive_ID` bukan lagi ID root (bugS1.6)
- [ ] Spreadsheet cabang bisa dibuka dan dibaca service account

**C. Upload**
- [ ] Foto checklist terunggah, nama berkas sesuai format
- [ ] Foto handover terunggah (sebelumnya tanpa kompresi)
- [ ] Foto incident terunggah (sebelumnya tanpa kompresi)
- [ ] Kelima bucket jam menghasilkan label yang benar
- [ ] Foto incident di luar shift menghasilkan `umum`
- [ ] `.webp` ≤ 150 KB pada upload worst-case
- [ ] Shift tertutup tetap memberi 409 dengan pesan yang jelas

**D. Laporan**
- [ ] Foto checklist tampil sebagai tombol, bukan gambar
- [ ] Foto incident tampil sebagai tombol
- [ ] Tautan terbuka di tab baru dan bisa diakses tanpa login
- [ ] Laporan publik `/r/[token]` menampilkan tombol yang sama
- [ ] Foto yang tidak menempel pada shift tetap tersembunyi

**E. Migration**
- [ ] `CBGBDG01` terstruktur ulang; spreadsheet masih terbaca
- [ ] `Evidence_Folder_ID` terisi di Registry
- [ ] Akses service account tidak putus

**F. Otomatis**
- [ ] `npm run test`
- [ ] `npm run lint` (oxlint)
- [ ] `npm run typecheck`
- [ ] `npm run build`
