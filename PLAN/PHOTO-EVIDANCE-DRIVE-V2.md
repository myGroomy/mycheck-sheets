# Rencana v2: Photo Evidence di Google Drive via Google Apps Script

> **Status dokumen:** RENCANA v2, **sebagian sudah diimplementasikan** (belum di-commit). Menggantikan [`PHOTO-EVIDENCE-DRIVE.md`](http://PHOTO-EVIDENCE-DRIVE.md) v1. Perubahan utama dirangkum diS15.
>
> Legenda status:
>
> - **\[SAH\]**: fakta terverifikasi di source code atau API Google saat dokumen ditulis
> - **\[RENCANA\]**: yang hendak dikerjakan
> - **\[BELUM DIUJI\]**: belum dijalankan, jangan dianggap lulus
>
> **Status implementasi (per 16 Okt 2026):**
>
> - Fase A–H sudah ditulis di working tree. Uji otomatis hijau: `npm run test` 180/180, `npm run lint` bersih untuk berkas yang disentuh, `npm run typecheck` bersih, `npm run build` OK.
> - **Belum ada satu pun uji runtime terhadap Google Drive, GAS, Registry, atau spreadsheet sungguhan.** Semua uji memakai fake Sheets in-memory.
> - **Fase 0 terblokir:** service account tidak bisa menghapus permission `anyone` (`permissions.delete` → "The authenticated user cannot delete the permission"). Jalur resmi lewat `revokePublicWrite` GAS. Tooling siap (`scripts/revoke-public-write.ts`), tetapi menunggu deploy GAS.
> - **Fase A terblokir:** GAS harus dideploy manual oleh pemilik akun; env `MYCHECK_GAS_URL`, `MYCHECK_GAS_UPLOAD_KEY`, `MYCHECK_GAS_ADMIN_KEY` belum diset.
> - **Fase D belum dijalankan:** `Branch_Folder_ID`/`Evidence_Folder_ID` untuk `CBGBDG01` masih kosong, jadi fallback `ensureBranchPhotoFolder` masih dipakai (§7.4).
> - ChecklistS14 masih `[BELUM DIUJI]`.

---

## 0. Ringkasan

Upload foto evidence saat ini **tidak pernah berhasil** karena service account tidak memiliki kuota storage Google Drive. Rencana ini memindahkan penulisan berkas ke Google Apps Script (GAS) yang berjalan di bawah akun Google manusia, merapikan struktur folder cabang, dan mengubah tampilan foto di laporan dari gambar inline menjadi tautan.

Versi ini juga menutup celah yang ditemukan pada v1: penomoran berkas yang bisa bentrok, pemeriksaan folder yang salah untuk kedalaman dua tingkat, urutan pembuatan cabang yang tidak idempotent, kunci API yang terlalu kuat, dan batas 5 foto yang dihitung lintas shift.


| #   | Keputusan                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Fase 0 (wajib pertama):** cabut izin `anyoneWithLink: writer` pada root dan folder cabang.                                    |
| 2   | Pembuatan cabang menghasilkan satu **folder cabang** berisi spreadsheet cabang dan folder `Evidence/`.                          |
| 3   | GAS membuat struktur cabang dalam satu panggilan, dan operasi ini **idempotent** (aman diulang).                                |
| 4   | Foto **boleh diakses publik** lewat `Anyone with the link: viewer`, dibatasi **per berkas**, tidak pernah pada folder.          |
| 5   | GAS dideploy sebagai **Execute as:** [`<n`](mailto:taufikalwan47@gmail.com), **Access: Anyone**, dengan **dua kunci terpisah**. |
| 6   | Foto di laporan ditampilkan sebagai **tombol** menuju link Drive, bukan gambar inline.                                          |
| 7   | Format berkas: WebP, maks 1600 px, target ≤150 KB.                                                                              |
| 8   | Nama berkas: `[KODE]-[tgl]-[slot]-[user]-[urutan].webp`. Urutan diberikan oleh GAS di bawah lock.                               |
| 9   | `[slot]` diturunkan dari `start_time` shift definition, bukan dari nama shift.                                                  |
| 10  | Kolom Registry **baru** `Branch_Folder_ID` dan `Evidence_Folder_ID`. `Folder_Drive_ID` tidak lagi ditulis.                      |
| 11  | Batas foto per pertanyaan dihitung **per shift**, hanya untuk status `uploaded`.                                                |
| 12  | Urutan pembuatan cabang: **Registry dulu (nonaktif), GAS, lalu Registry aktif**.                                                |


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

Ini perilaku bawaan Google untuk seluruh service account, bukan miskonfigurasi env. `drive.files.create` untuk berkas selalu gagal.

### 1.2 Hanya sebagian operasi Drive yang berhasil \[SAH\]


| Operasi Drive                     | Hasil | Catatan                          |
| --------------------------------- | ----- | -------------------------------- |
| `files.get` / `files.list` (baca) | ✅     | Service account punya akses baca |
| `files.create` (**folder**)       | ✅     | Folder tidak menyimpan byte      |
| `files.create` (**berkas**)       | ❌     | Butuh kuota                      |


Folder `MyCheck - CBGBDG01` dimiliki service account, sehingga terlihat sudah benar, padahal tidak ada foto yang bisa masuk. Sheet `Photos` kosong di semua tab bulanan (2026-09/10/11) dan folder cabang berisi 0 berkas.

### 1.3 Galat tidak tertangani menjadi HTTP 500 tanpa body \[SAH\]

`route.ts:206` dibungkus `try` hanya untuk `ensureBranchPhotoFolder`, sedangkan `drive.files.create` tidak. Exception lepas ke handler Next.js, klien menerima 500 dengan body kosong:

```ts
// lib/upload-photo.ts:44
const result = JSON.parse(xhr.responseText);   // body kosong → lempar
// → reject(new Error('Upload gagal: respons server tidak valid'))

```

Pesan ke pengguna menyesatkan karena penyebab sebenarnya tidak pernah sampai ke UI.

### 1.4 Struktur Drive sekarang: saudara, bukan bersarang \[SAH\]

```
CHECKLIST-APP                       (root, owner taufikalwan47@gmail.com)
├── RESGISTRY_MYCHECK                (spreadsheet)
├── CBGBDG01 - Bandung                (spreadsheet)   ← belum di dalam folder cabang
└── MyCheck - CBGBDG01                (folder, owner service account)

```

### 1.5 Skema REGISTRY sekarang \[SAH\]

`Daftar_Cabang`:

```
Cabang_ID | Nama_Cabang | Kode | Timezone | Spreadsheet_ID | Folder_Drive_ID | Aktif | Alamat

```

- `Kode` sudah ada, jadi `[KODE]` pada nama berkas tidak perlu kolom baru.
- `Folder_Drive_ID` saat ini menunjuk folder foto untuk CBGBDG01 (`MyCheck - CBGBDG01`), tetapi untuk cabang yang dibuat lewat `POST /api/admin/branches` berisi ID folder root. Artinya kolom ini sudah **tidak konsisten** antarbaris.

### 1.6 Bug laten pada pembuatan cabang \[SAH\]

```ts
// app/api/admin/branches/route.ts:11
const folderDriveId = () => process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';
// app/api/admin/branches/route.ts:87
Folder_Drive_ID: folderDriveId(),

```

Cabang baru diisi ID folder root, bukan folder cabangnya. Tidak berbahaya selama tidak dibaca, tetapi akan salah begitu folder evidence dibaca dari kolom itu.

### 1.7 Pembuatan spreadsheet cabang masih manual \[SAH\]

```ts
// app/api/admin/branches/route.ts:85-88
Spreadsheet_ID: '',
Aktif: false, // aktif setelah Spreadsheet_ID diisi & di-share ke service account

```

Menyalin berkas template adalah operasi berkas, tidak bisa dilakukan service account.

### 1.8 WebP sudah ada, tapi hanya di 1 dari 3 jalur \[SAH\]

`compressPhoto()` di `components/shift/checklist-point-controls.tsx:44` sudah melakukan resize maks 1600 px, WebP quality ladder `0.82→0.28`, target ≤150 KB, dan gagal bila browser tidak mendukung WebP.


| Jalur upload                        | Memakai `compressPhoto`? |
| ----------------------------------- | ------------------------ |
| `checklist-point-controls.tsx`      | ✅ ya                     |
| `shift-close-dialog.tsx` (handover) | ❌ kirim berkas mentah    |
| `incident-create-form.tsx`          | ❌ kirim berkas mentah    |


Tidak perlu dependency baru, cukup memindahkan fungsi ke modul bersama.

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

`Photos[].fileRef` sudah berisi ID berkas Drive, jadi tautan dapat dibentuk tanpa perubahan server.

### 1.10 Batas 5 foto per pertanyaan dihitung lintas shift \[SAH\]

```ts
// app/api/photos/upload/route.ts:24
const MAX_ATTACHED_PHOTOS = 5;
// app/api/photos/upload/route.ts:172-179
const count = existing.filter((photo) =>
  asStr(photo['owner_type']) === ownerType && asStr(photo['owner_id']) === ownerId
).length;

```

Untuk entry, `owner_id` adalah `point_ref`, yang sama setiap hari. Akibatnya satu pertanyaan hanya bisa menerima 5 foto **per bulan untuk semua shift**. Shift berikutnya di bulan yang sama tidak bisa menambah foto untuk pertanyaan itu.

### 1.11 GAS stokis sebagai referensi, dan statusnya \[SAH\]

- `stokis/lib/appsscript.ts:137`: `uploadFileToGASDrive()` sisi Next.js
- `stokis/apps-script/PDF.js:203`: `uploadFileToDrive()` sisi GAS
- Autentikasi `x-api-key` dengan perbandingan constant-time (`Code.js:27`, `secureKeyEqual_`)

Deployment stokis sekarang tidak dapat dipanggil: `HTTP 405`. Service account stokis juga punya `quota limit = 0` dan 0 berkas. Polanya benar secara desain, tetapi harus ditulis ulang dan diuji ulang.

---

## 2. Prasyarat yang Sudah Terverifikasi \[SAH\]


| Pemeriksaan                                                                              | Hasil                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| Akun [`taufikalwan47@gmail.com`](mailto:taufikalwan47@gmail.com) memiliki `storageQuota` | 15 GB kuota personal, cukup                   |
| Akun tersebut **owner** `Template_cabang_mycheck`                                        | ✅ GAS boleh menyalin template                 |
| Template ada di bawah `CHECKLIST-APP`                                                    | ✅ sesuai allowlist                            |
| Template punya 22 sheet, cocok dengan `branch-schema.ts`                                 | ✅ tidak ada sheet hilang                      |
| Service account boleh membuat folder                                                     | ✅                                             |
| Service account tidak boleh menyalin berkas                                              | ❌ butuh GAS                                   |
| Izin `anyoneWithLink: writer` pada ROOT dan CABANG                                       | ⚠️ **harus dicabut lebih dulu**, lihat Fase 0 |


> Izin `Anyone with the link` pada folder tidak otomatis berlaku ke berkas di dalamnya. Setiap foto di-share secara eksplisit oleh GAS (§3.4).

---

## 3. Fase A: Kode GAS \[RENCANA\]

Deliverable: [`Code.gs`](http://Code.gs), [`SetKey.gs`](http://SetKey.gs), dan `appsscript.json` untuk di-deploy manual. **Tidak ada perubahan kode MyCheck di fase ini.**

### 3.1 Kontrak API

Satu endpoint `POST /exec` dengan body `text/plain` berisi JSON. Kunci dikirim di field `x-api-key` di dalam body, bukan di header, agar request tidak memicu preflight CORS.

Action yang tersedia:


| Action                  | Kunci yang diizinkan | Fungsi                                            |
| ----------------------- | -------------------- | ------------------------------------------------- |
| `ping`                  | keduanya             | Health check dan verifikasi kunci                 |
| `uploadPhoto`           | `KEY_UPLOAD`         | Simpan satu foto ke folder evidence               |
| `createBranchStructure` | `KEY_ADMIN`          | Buat atau kembalikan struktur cabang (idempotent) |
| `revokePublicWrite`     | `KEY_ADMIN`          | Cabut izin `anyone` pada root/folder cabang (Fase 0) |

Service account tidak bisa melakukan Fase 0 sendiri: `permissions.delete` ditolak dengan "The authenticated user cannot delete the permission" meskipun `capabilities.canShare = true`, karena izin `anyone` diwarisi dan SA bukan owner root. Hanya GAS (berjalan sebagai owner) yang bisa mencabut.


#### Action `ping`

```jsonc
// request
{ "action": "ping", "x-api-key": "<key>" }
// response
{ "success": true, "data": { "version": "2", "time": "2026-10-16T06:00:00Z" } }

```

#### Action `createBranchStructure`

```jsonc
// request
{ "action": "createBranchStructure", "x-api-key": "<KEY_ADMIN>",
  "payload": { "branchCode": "CBGBDG02", "branchName": "Cabang Bandung Barat" } }

// response
{ "success": true,
  "data": { "branchFolderId": "...", "spreadsheetId": "...", "evidenceFolderId": "...", "reused": false } }

```

`reused: true` berarti struktur sudah ada dari percobaan sebelumnya dan dikembalikan apa adanya (lihatS5).

Langkah di dalam GAS:

1. Validasi `branchCode` cocok `^[A-Z0-9-]{2,20}$`.
2. Validasi `branchName` ≤ 120 karakter, tanpa karakter kontrol.
3. Cari folder root `ALLOWED_ROOT_IDS` dengan properti `mycheck_branch = branchCode`. Bila ada, pakai dan lanjut ke langkah 6 dengan `reused = true`.
4. Buat folder `{branchCode} - {branchName}` di root, lalu set `mycheck_branch = branchCode`.
5. Salin `TEMPLATE_SHEET_ID` ke folder itu dengan `makeCopy`, lalu set properti yang sama pada berkas hasil salinan. Share ke `SA_EMAIL` dengan `addEditor`.
6. Buat subfolder `Evidence` di dalam folder cabang bila belum ada.
7. Kembalikan ketiga ID dan `reused`.

Langkah 3 dan 5 membuat pemanggilan ulang aman. Bila langkah sebelumnya gagal di tengah, pemanggilan berikutnya meneruskan dari titik yang sudah ada.

#### Action `uploadPhoto`

```jsonc
// request
{ "action": "uploadPhoto", "x-api-key": "<KEY_UPLOAD>",
  "payload": { "folderId": "...", "baseName": "CBGBDG01-16102026-pagi-dea",
               "mimeType": "image/webp", "fileBase64": "..." } }

// response
{ "success": true,
  "data": { "fileId": "...", "fileUrl": "https://drive.google.com/file/d/.../view",
            "fileName": "CBGBDG01-16102026-pagi-dea-1.webp", "sizeBytes": 123456 } }

```

`baseName` tidak memuat urutan. GAS yang menentukan `-N` (lihatS3.3).

#### Action `revokePublicWrite`

```jsonc
// request — tanpa folderIds: seluruh ALLOWED_ROOT_IDS diproses
{ "action": "revokePublicWrite", "x-api-key": "<KEY_ADMIN>",
  "payload": { "folderIds": ["1fBD-...", "1Bx6l_..."] } }

// response
{ "success": true,
  "data": { "results": [ { "folderId": "...", "name": "CHECKLIST-APP",
                           "revoked": 1, "remainingPublic": 0, "failed": [] } ],
            "totalTargets": 2, "totalRemainingPublic": 0 } }

```

Hanya permission bertipe `anyone` yang dihapus; permission `user`/`domain` tidak pernah disentuh sehingga akses service account dan owner tetap utuh. Folder di luar subtree `ALLOWED_ROOT_IDS` ditolak.

CLI: `npm run revoke:public-write` (`scripts/revoke-public-write.ts`), opsi `--dry-run` dan `--folder <ID>`. Script membaca ulang permission via service account setelah memanggil GAS, sehingga hasil verifikasi tidak bergantung pada laporan GAS.

### 3.2 Autentikasi dan pembatasan laju

- Dua kunci di Script Properties: `KEY_UPLOAD` dan `KEY_ADMIN`. Keduanya dibuat oleh [`SetKey.gs`](http://SetKey.gs) dengan prefix berbeda (`up_` dan `adm_`).
- Perbandingan dengan `secureKeyEqual_` (constant-time). **Fail closed**: tanpa kunci yang cocok, request ditolak tanpa efek samping.
- Batas laju sederhana dengan `CacheService`: maksimal 60 request per menit per kunci. Melebihi batas dijawab `429`.
- Log setiap percobaan (action, hasil, waktu) dengan `Logger`. **Jangan** pernah mencatat isi kunci atau isi berkas.

### 3.3 Penomoran dan penulisan berkas di bawah lock

Penomoran tidak boleh dihitung di Next.js. Dua upload paralel bisa mendapat nomor yang sama. GAS menghitung urutan dan menulis berkas dalam satu critical section:

```js
function uploadPhoto_(folder, baseName, mimeType, base64) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let max = 0;
    const re = new RegExp('^' + escapeRe_(baseName) + '-(\\d+)\\.webp$');
    const files = folder.getFiles();
    while (files.hasNext()) {
      const m = files.next().getName().match(re);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const name = baseName + '-' + (max + 1) + '.webp';
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, name);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file;
  } finally {
    lock.releaseLock();
  }
}

```

`LockService` berlaku per script. Untuk skala satu cabang sampai beberapa cabang ini memadai. Bila `waitLock` gagal, GAS menjawab `503` dan klien boleh mencoba lagi.

### 3.4 Pemeriksaan folder: seluruh leluhur, bukan induk langsung

Folder `Evidence` berada dua tingkat di bawah root (`CHECKLIST-APP → MyCheck - CBGBDG01 → Evidence`). Pemeriksaan hanya pada induk langsung akan menolak semua foto yang sah.

```js
function isUnderAllowedRoot_(folder, allowedIds) {
  let current = folder;
  for (let depth = 0; depth < 6; depth++) {
    const parents = current.getParents();
    if (!parents.hasNext()) return false;
    current = parents.next();
    if (allowedIds.indexOf(current.getId()) !== -1) return true;
  }
  return false;
}

```

Batas kedalaman 6 mencukupi untuk struktur sekarang, dan mencegah loop tak terbatas bila ada folder yang punya banyak induk.

### 3.5 Hardening (wajib, endpoint publik)


| Ancaman                                        | Penanggulangan                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `folderId` di luar subtree cabang              | `isUnderAllowedRoot_` (§3.4), dicek sebelum tulis                             |
| Kunci upload bocor lalu dipakai membuat cabang | Dua kunci terpisah; `KEY_UPLOAD` tidak bisa memanggil `createBranchStructure` |
| Berkas berbahaya diunggah                      | MIME allowlist dan batas ukuran                                               |
| Nama berkas menyisipkan path (`../`)           | `baseName` divalidasi regex ketat, tidak pernah dipakai sebagai path          |
| Pemanggilan massal                             | Batas laju `CacheService` (§3.2)                                              |
| Pemanggilan dengan kunci salah berulang        | Dicatat di log; batas laju juga berlaku untuk kunci salah                     |


Rincian:

- **MIME**: hanya `image/webp`, `image/png`, `image/jpeg`.
- **Ukuran**: hasil decode base64 ≤ 5 MB. Request ±6,7 MB, jauh di bawah batas GAS.
- `baseName`: `^[A-Z0-9][A-Z0-9-]{0,40}-\d{8}-[a-z]+-[a-z0-9._-]{1,30}$`. Ditolak bila tidak cocok.
- **Sharing**: hanya berkas, bukan folder, dengan `ANYONE_WITH_LINK` dan `VIEW`.
- **Folder evidence tidak pernah** di-set `Anyone with the link`.

### 3.6 Script Properties


| Properti            | Nilai / cara                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `KEY_UPLOAD`        | Dibuat [`SetKey.gs`](http://SetKey.gs), prefix `up_` + UUID tanpa tanda hubung  |
| `KEY_ADMIN`         | Dibuat [`SetKey.gs`](http://SetKey.gs), prefix `adm_` + UUID tanpa tanda hubung |
| `ALLOWED_ROOT_IDS`  | Dipisah koma. Isi awal: `1fBD-OjYUUYA509JHdOF2xOB_ICMBr4b-` (CHECKLIST-APP)     |
| `TEMPLATE_SHEET_ID` | ID `Template_cabang_mycheck`                                                    |
| `SA_EMAIL`          | Email service account, untuk `addEditor`                                        |


### 3.7 Langkah deploy (manual)

1. Buat project Apps Script baru.
2. Tempel [`Code.gs`](http://Code.gs) dan [`SetKey.gs`](http://SetKey.gs), isi `appsscript.json`.
3. Isi Script Properties di atas, lalu jalankan `SetKey` sekali. Catat kedua kunci.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me (**[`taufikalwan47@gmail.com`](mailto:taufikalwan47@gmail.com)**)**
   - Who has access: **Anyone**
5. Setiap perubahan kode berikutnya: **Manage deployments → Edit → New version**, lalu catat nomor versinya di dokumen ini. Tanpa itu, URL `/exec` tetap menjalankan kode lama.
6. Uji `ping` dengan kedua kunci sebelum melanjutkan ke fase lain.

---

## 4. Fase B: REGISTRY \[RENCANA\]

Dua kolom baru ditambahkan **di akhir** agar kolom lama tidak bergeser:

```
Cabang_ID | Nama_Cabang | Kode | Timezone | Spreadsheet_ID | Folder_Drive_ID | Aktif | Alamat | Branch_Folder_ID | Evidence_Folder_ID

```


| Berkas                         | Perubahan                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `lib/google/registry.ts`       | Tambah `Branch_Folder_ID?` dan `Evidence_Folder_ID?` pada `CabangRecord`                    |
| `lib/google/registry-admin.ts` | Tambah kedua header di akhir `CABANG_HEADERS`                                               |
| `lib/google/registry-admin.ts` | `updateCabangStructure(cabangId, {spreadsheetId, branchFolderId, evidenceFolderId, aktif})` |
| Registry (live)                | Tambah dua header kosong. **Tidak** mengubah nilai baris yang ada.                          |


`Folder_Drive_ID` **tidak lagi ditulis.** Kolom ini tetap dibaca oleh kode lama sampai Fase D selesai, lalu dihapus dari `CABANG_HEADERS` di fase berikutnya. Tidak ada perubahan makna diam-diam.

---

## 5. Fase C: Alur Pembuatan Cabang \[RENCANA\]

`POST /api/admin/branches` diubah menjadi urutan **registry-first**, yang aman diulang:

```
1. Validasi body (Zod, tidak berubah)
2. Cek kode cabang belum dipakai di Registry
3. Tulis Registry: baris baru dengan Aktif = false, Spreadsheet_ID = '', ID lain kosong
4. → GAS createBranchStructure({branchCode, branchName})   (KEY_ADMIN)
5. Update Registry: Spreadsheet_ID, Branch_Folder_ID, Evidence_Folder_ID, Aktif = true
6. Response ke UI menampilkan ketiga ID dan status

```

Perilaku pada kegagalan:


| Titik gagal       | Kondisi di Drive        | Kondisi di Registry | Tindakan                                                         |
| ----------------- | ----------------------- | ------------------- | ---------------------------------------------------------------- |
| Sebelum langkah 3 | tidak ada               | tidak ada           | Kembalikan error, tidak ada yang perlu dibersihkan               |
| Langkah 4 gagal   | sebagian atau tidak ada | baris `Aktif=false` | Cabang tampil sebagai "belum aktif", admin klik ulang            |
| Langkah 5 gagal   | lengkap                 | baris `Aktif=false` | Pemanggilan ulang memicu `reused=true`, lalu Registry diperbarui |


Dengan begitu tidak ada spreadsheet yatim yang tersembunyi: setiap cabang setengah jadi terlihat di Registry sebagai nonaktif dan bisa diselesaikan ulang.

Kode yang ditulis sebelum Fase A selesai tidak boleh memanggil GAS. Bila `POST` dipanggil sebelum GAS siap, route menjawab `503` dan tidak menulis baris Registry.

---

## 6. Fase D: Migrasi Cabang `CBGBDG01` \[RENCANA\]

Dikerjakan manual, dengan cadangan.


| Langkah | Aksi                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0       | Cadangkan Registry (export CSV). Catat ID folder `MyCheck - CBGBDG01` dan `Folder_Drive_ID` saat ini.                            |
| 1       | Verifikasi folder `MyCheck - CBGBDG01` memang folder foto, dengan 0 berkas (sesuaiS1.2). Bila ada berkas, berhenti dan periksa. |
| 2       | Buat subfolder `Evidence` di dalam `MyCheck - CBGBDG01`.                                                                         |
| 3       | Pindahkan spreadsheet `CBGBDG01 - Bandung` ke dalam `MyCheck - CBGBDG01`.                                                        |
| 4       | Isi `Branch_Folder_ID` = ID `MyCheck - CBGBDG01`, `Evidence_Folder_ID` = ID folder `Evidence`.                                   |
| 5       | Set properti `mycheck_branch = CBGBDG01` pada folder cabang dan spreadsheet (agar idempotensiS3.1 berlaku).                     |
| 6       | Uji: spreadsheet masih terbaca service account; `createBranchStructure` dengan `CBGBDG01` mengembalikan `reused = true`.         |
| 7       | Cabut izin `anyoneWithLink: writer` yang tersisa (lihat Fase 0 bila belum dilakukan).                                            |


> Memindahkan berkas di Drive tidak memutus izin yang sudah diberikan. Tetap uji langkah 6.

---

## 7. Fase E: Klien GAS dan Upload Foto \[RENCANA\]

### 7.1 Nama berkas

Fungsi murni di `lib/photo-filename.ts`:

```ts
buildPhotoBaseName({ branchCode, shiftDate, startTime, username })
// → "CBGBDG01-16102026-pagi-dea"   (tanpa -urutan; GAS menambahkannya)

```


| Bagian     | Sumber                        | Aturan                                                                |
| ---------- | ----------------------------- | --------------------------------------------------------------------- |
| `[KODE]`   | REGISTRY `Kode`               | Huruf besar, buang karakter di luar `[A-Z0-9-]`, fallback `UMUM`      |
| `[tgl]`    | `ShiftInstances.shift_date`   | `DDMMYYYY`. Bila kosong, tanggal hari ini di zona waktu cabang        |
| `[slot]`   | `ShiftDefinitions.start_time` | LihatS7.2                                                            |
| `[user]`   | session `username`            | Huruf kecil, buang karakter di luar `[a-z0-9._-]`, fallback `unknown` |
| `[urutan]` | GAS, di bawah lock (§3.3)     | Mulai 1, per `baseName`                                               |


Penomoran per `baseName` (tanggal + slot + user + kode) berarti dua shift dengan slot dan user yang sama pada tanggal sama berbagi satu deret nomor. Ini disengaja: nama tetap unik, dan nomor berurutan mengikuti urutan unggah.

### 7.2 Penurunan `[slot]` dari jam

Lima rentang tanpa tumpang tindih, menutup 00:00–23:59:


| `start_time` | `slot`  |
| ------------ | ------- |
| 00:00–05:59  | `malam` |
| 06:00–10:59  | `pagi`  |
| 11:00–14:59  | `siang` |
| 15:00–18:59  | `sore`  |
| 19:00–23:59  | `malam` |


Dua rentang menghasilkan `malam`. Ini keputusan sadar: bucket hanya memberi label kasar, dan urutan tetap membedakan berkas. Fallback `umum` bila shift tidak ada (misalnya foto insiden di luar shift) atau `start_time` tidak bisa diparse.

Kesesuaian dengan data \[SAH\]: shift aktif `Shift Pagi` (07:00) dan `Shift Siang` (12:00) menghasilkan `pagi` dan `siang`. Nama lama seperti `T1f4 Pagi 428190` (00:00–23:59) menghasilkan `malam`, karena nama tidak lagi dipakai sebagai sumber.

### 7.3 Klien GAS


| Berkas                           | Isi                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/google/gas-client.ts`       | `callGas(action, payload, keyKind)`: POST JSON, `Content-Type: text/plain`, timeout eksplisit |
| `lib/google/photo-upload-gas.ts` | Bungkus `uploadPhoto`, pemetaan galat eksplisit (§7.5)                                        |
| `lib/google/branch-gas.ts`       | Bungkus `createBranchStructure`                                                               |
| `lib/google/drive-permission-gas.ts` | Bungkus `revokePublicWrite` + `isFullyRevoked` (fail bila ada `remainingPublic`)          |
| `scripts/revoke-public-write.ts` | CLI Fase 0: snapshot sebelum → GAS → verifikasi ulang lewat service account                   |


Environment baru:

```
MYCHECK_GAS_URL            # URL /exec dari GAS
MYCHECK_GAS_UPLOAD_KEY     # KEY_UPLOAD
MYCHECK_GAS_ADMIN_KEY      # KEY_ADMIN

```

> `STOKIS_API_KEY` tidak boleh disentuh. Variabel itu adalah signing key session (`lib/session.ts:9`), dan mengubahnya membatalkan seluruh sesi yang berjalan.

Timeout: `callGas` memakai batas eksplisit (misalnya 25 detik). Batas fungsi serverless di Vercel harus lebih besar dari timeout ini.

### 7.4 Mengganti route upload

`app/api/photos/upload/route.ts`: blok `drive.files.create` diganti panggilan GAS, dan batas foto dihitung per shift:

```ts
// Batas foto per shift (BARU)
const count = existing.filter((photo) =>
  asStr(photo['owner_type']) === ownerType &&
  asStr(photo['owner_id']) === ownerId &&
  asStr(photo['shift_instance_id']) === shiftInstanceId &&
  asStr(photo['status']) === 'uploaded'
).length;
if (count >= MAX_ATTACHED_PHOTOS) { /* 400 */ }

// Upload
const folderId = cabang.Evidence_Folder_ID
  || (await ensureBranchPhotoFolder(branchId));      // fallback, lihat catatan
const uploaded = await uploadPhotoViaGas({
  folderId,
  baseName: buildPhotoBaseName({ branchCode, shiftDate, startTime, username }),
  mimeType: file.type,
  buffer,
});

// Metadata: hanya setelah upload sukses
await insertRow(spreadsheetId, monthlySheet('Photos', tabMonth), {
  ...,
  file_ref: uploaded.fileId,
  sha256: sha256Hex(buffer),
  status: 'uploaded',
});

```

Urutan penulisan: **GAS upload dulu, baris** `Photos` **kemudian**. Bila penulisan baris gagal, berkas menjadi yatim. Itu diterima untuk fase ini dan dicatat sebagai item rekonsiliasi (§13).

Fallback `ensureBranchPhotoFolder` hanya untuk cabang yang `Evidence_Folder_ID`-nya masih kosong. Setelah Fase D, fallback dihapus.

Kolom `sha256` ditambahkan di **akhir** header `Photos` di `lib/google/branch-schema.ts`. Template spreadsheet cabang juga perlu kolom yang sama, sehingga template harus diperbarui lebih dulu, lalu cabang yang sudah ada diperbarui dengan menambah header di akhir.

Sisa alur (validasi, batas jumlah foto, `ensureMonthlySheet`) tetap seperti sekarang.

### 7.5 Pemetaan galat

Tidak ada galat yang lolos sebagai 500 kosong. Setiap respons non-2xx dari GAS dipetakan:


| Kondisi                              | HTTP ke klien | Pesan ke pengguna                          |
| ------------------------------------ | ------------- | ------------------------------------------ |
| Kunci GAS ditolak (401/403 dari GAS) | 502           | "Konfigurasi server tidak valid."          |
| Folder di luar subtree cabang        | 502           | "Folder penyimpanan tidak dikenali."       |
| MIME atau ukuran tidak valid         | 400           | Pesan spesifik (sudah ada)                 |
| Shift bukan `berjalan`               | 409           | Pesan yang sudah ada                       |
| Batas 5 foto per shift tercapai      | 400           | "Maksimal 5 foto untuk satu pertanyaan."   |
| GAS membalas 429 atau 503            | 503           | "Server sedang sibuk. Coba lagi sebentar." |
| Kuota akun GAS habis                 | 507           | "Penyimpanan foto sedang penuh."           |
| Timeout atau galat lain              | 502           | "Foto gagal disimpan. Coba lagi."          |


Setiap galat dicatat di log server dengan kode, tanpa isi berkas atau kunci.

---

## 8. Fase F: WebP di Semua Jalur \[RENCANA\]


| Langkah | Berkas                                                             |
| ------- | ------------------------------------------------------------------ |
| 1       | Pindahkan `compressPhoto` ke `lib/photo-compress.ts` (modul klien) |
| 2       | `checklist-point-controls.tsx` mengimpor dari sana                 |
| 3       | `shift-close-dialog.tsx` (handover) memakai `compressPhoto`        |
| 4       | `incident-create-form.tsx` memakai `compressPhoto`                 |
| 5       | `upload-photo.ts` menolak berkas non-WebP sebagai jaring pengaman  |


Batas 5 MB di server tetap sebagai jaring pengaman. Sumber sampai 15 MB boleh, karena kompresi dilakukan di klien.

---

## 9. Fase G: Tampilan Laporan \[RENCANA\]

`components/report/public-report-view.tsx:241-253`: ganti `<figure><img>` dengan tombol:

```
[Cek bukti foto]  →  https://drive.google.com/file/d/{fileRef}/view

```

- Berlaku untuk `ownerType` `entry`, `handover`, dan `incident`.
- `photos[].src` (proxy `/api/photos/[id]`) tidak lagi dipakai di laporan.
- Endpoint `/api/photos/[id]` **dipertahankan** untuk pratinjau terautentikasi di halaman lain. Sebelum mengubah, audit pemakai `src` agar tidak ada yang ikut rusak.
- Tombol membuka tab baru (`target="_blank" rel="noreferrer"`).
- Label tombol memuat konteks: nama poin untuk checklist, nama field untuk handover, atau "Insiden", memakai pemetaan `pointTitleByRef` yang sudah ada.
- Foto yang tidak lolos filter `attachedPhotos` tetap disembunyikan.

Karena berkas `Anyone with the link: viewer`, pembaca laporan publik `/r/[token]` bisa membuka tautan tanpa login. Ini konsekuensi yang disetujui (§12).

---

## 10. Fase H: Test \[RENCANA\]

Repo tidak punya uji komponen React, jadi fokusnya pada logika murni dan route.


| Berkas uji                        | Cakupan                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tests/photo-filename.test.ts`    | Format `DDMMYYYY`, lima bucket jam, sanitasi kode dan username, fallback, `baseName` ditolak bila salah bentuk |
| `tests/gas-client.test.ts`        | Body dan header benar, pemetaan status GAS ke galat Next.js, tidak pernah melempar `undefined`, timeout        |
| `tests/registry-evidence.test.ts` | `Branch_Folder_ID` dan `Evidence_Folder_ID` ada di akhir `CABANG_HEADERS`; `Folder_Drive_ID` tidak ditulis     |
| `tests/branch-create.test.ts`     | Urutan registry-first: GAS gagal meninggalkan baris `Aktif=false`; pemanggilan ulang tidak membuat baris ganda |
| `tests/photo-limit.test.ts`       | Batas 5 per shift: foto kedua di shift lain pada hari yang sama tetap diterima; purged tidak dihitung          |


Verifikasi yang tidak bisa dibuktikan test wajib dijalankan manual (§14).

---

## 11. Urutan Eksekusi dan Dependensi

```
  Fase 0   cabut izin anyoneWithLink: writer              ← PERTAMA, tanpa dependensi
    │
  Fase A   GAS (manual), uji ping kedua kunci            ← BLOCKER untuk B–G
    │
  Fase B   REGISTRY: kolom baru
    │
  Fase C   POST /api/admin/branches → registry-first
    │
  Fase D   migrasi CBGBDG01
    │
  Fase E   klien GAS + upload + batas per shift + sha256  ──►  Fase F   WebP semua jalur
    │                                                                 │
    └──────────────────────────────┬──────────────────────────────────┘
                                   ▼
                            Fase G   tombol tautan Drive di laporan

  Fase H   test ditulis berdampingan dengan tiap fase

```

Fase 0 tidak menunggu GAS. Fase A adalah blocker untuk semua fase setelahnya.

---

## 12. Risiko dan Batasan \[RENCANA\]

1. **Foto menjadi publik.** Setiap berkas `Anyone with the link: viewer`. ID berkas acak sehingga tidak bisa ditebak, tetapi laporan `/r/[token]` bisa dibagikan ke pihak ketiga, dan tautan foto ikut tersebar. Diterima secara sadar. Pembatasan ke berkas, bukan folder, membatasi dampaknya.
2. **Kunci upload bocor.** Penyerang bisa menambah berkas ke subtree cabang yang diizinkan, tetapi tidak bisa membuat cabang atau menulis di luar root. Batas laju membatasi volumenya. Kunci dirotasi dengan menjalankan `SetKey` ulang dan memperbarui env Next.js.
3. **Akun GAS adalah akun personal.** [`taufikalwan47@gmail.com`](mailto:taufikalwan47@gmail.com) adalah akun pribadi dengan kuota 15 GB. Bila akun dihapus atau terkunci, semua foto ikut hilang. Tidak ada redundansi. Migrasi ke Google Workspace atau Shared Drive perlu dipertimbangkan.
4. **GAS adalah titik gagal tunggal.** Tidak ada retry otomatis di sisi GAS. Klien boleh mencoba ulang untuk galat `503`. Baris `Photos` hanya ditulis setelah upload sukses, sehingga yatim hanya terjadi bila penulisan baris gagal (§13).
5. **Bucket jam bisa menyesatkan** bila dua shift punya jam mulai berdekatan (§7.2).
6. **Tidak ada transaksi lintas Google.** Tahap Registry dan GAS tidak atomik. Dijaga dengan urutan registry-first dan idempotensi (§5).
7. **Biaya kuota.** Setiap upload memakai kuota Drive akun tersebut.
8. **Konkurensi hanya dalam satu script.** `LockService` mencegah bentrok nomor berkas, tetapi tidak mencegah bentrok di luar script (misalnya edit manual di Drive).

---

## 13. Di Luar Lingkup \[RENCANA\]

Tidak dikerjakan dalam rencana ini, dicatat agar tidak dianggap sudah ada:

- Rekonsiliasi `Photos` dengan Drive secara berkala (berkas yatim dan baris tanpa berkas)
- Unggah banyak berkas per aksi
- Kompresi video atau dokumen
- Rotasi atau hapus foto lama
- Penyimpanan selain Drive (S3, Supabase Storage)
- Audit trail untuk perubahan izin Drive
- Pembersihan `anyoneWithLink` pada berkas lain di luar folder MyCheck
- Perbaikan hash audit log (`lib/db/audit.ts`). Ditangani dokumen terpisah.
- Perbaikan pencarian shift lintas cabang (`lib/instance-resolver.ts`)

---

## 14. Checklist Verifikasi Manual \[BELUM DIUJI\]

Tidak ada item di bawah yang sudah dijalankan.

**0. Fase 0**

- \[ \] Izin `anyoneWithLink: writer` pada root dan folder cabang sudah dicabut
- \[ \] Akses tulis publik tidak lagi bisa dilakukan dari tautan (uji dengan sesi tanpa login)
- \[ \] `npm run revoke:public-write -- --dry-run` melaporkan semua target tanpa memanggil GAS
- \[ \] `revokePublicWrite` dengan `KEY_UPLOAD` ditolak (pemisahan kunci)
- \[ \] `revokePublicWrite` hanya menghapus permission `anyone`; permission service account dan owner masih ada setelah dijalankan
- \[ \] `revokePublicWrite` menolak folder di luar subtree `ALLOWED_ROOT_IDS`

**A. GAS**

- \[ \] `ping` dengan `KEY_UPLOAD` dan `KEY_ADMIN` berhasil
- \[ \] `ping` dengan kunci salah ditolak, dan tidak ada operasi lain yang terjadi
- \[ \] `uploadPhoto` dengan `KEY_ADMIN` ditolak (pemisahan kunci)
- \[ \] `createBranchStructure` dengan `KEY_UPLOAD` ditolak (pemisahan kunci)
- \[ \] `createBranchStructure` membuat folder, salinan spreadsheet, dan `Evidence`
- \[ \] Panggilan kedua `createBranchStructure` yang sama mengembalikan `reused = true` dan tidak membuat folder atau spreadsheet baru
- \[ \] Spreadsheet hasil salinan terbaca service account
- \[ \] Folder di luar root allowlist ditolak
- \[ \] Folder di kedalaman dua di bawah root (`Evidence`) **diterima** (regresi bug induk-langsung)
- \[ \] MIME di luar allowlist ditolak
- \[ \] Berkas &gt; 5 MB ditolak
- \[ \] `baseName` tidak valid ditolak
- \[ \] Dua `uploadPhoto` paralel untuk `baseName` sama menghasilkan `-1` dan `-2`, tanpa duplikat
- \[ \] Batas laju aktif: request ke-61 dalam semenit dijawab 429
- \[ \] Foto ter-set `Anyone with the link: viewer`, dan folder tidak
- \[ \] Setelah edit kode, versi deployment baru dibuat dan diuji

**B. Pembuatan cabang**

- \[ \] Cabang uji dibuat. Baris Registry berisi ketiga ID dan `Aktif = true`
- \[ \] Simulasi gagal di langkah GAS: baris tetap `Aktif = false`, dan pemanggilan ulang berhasil
- \[ \] Simulasi gagal setelah GAS sukses: pemanggilan ulang tidak membuat folder ganda
- \[ \] `Folder_Drive_ID` tidak ditulis untuk cabang baru
- \[ \] Spreadsheet cabang bisa dibuka dan dibaca service account

**C. Upload**

- \[ \] Foto checklist terunggah dengan nama sesuai format, ber-suffix `-1`
- \[ \] Foto handover terkompresi dan terunggah
- \[ \] Foto incident terkompresi dan terunggah
- \[ \] Lima bucket jam menghasilkan label yang benar
- \[ \] Foto incident di luar shift menghasilkan `umum`
- \[ \] **Batas per shift:** shift A mengunggah 5 foto untuk satu pertanyaan, shift B pada hari yang sama masih bisa mengunggah
- \[ \] Foto purged tidak dihitung terhadap batas
- \[ \] `sha256` tersimpan di baris `Photos`
- \[ \] Shift tertutup tetap memberi 409 dengan pesan jelas
- \[ \] `.webp` ≤ 150 KB pada upload terburuk
- \[ \] Galat GAS tidak pernah menghasilkan 500 kosong

**D. Laporan**

- \[ \] Foto checklist tampil sebagai tombol, bukan gambar
- \[ \] Foto incident dan handover tampil sebagai tombol
- \[ \] Tautan terbuka di tab baru dan bisa diakses tanpa login
- \[ \] Laporan publik `/r/[token]` menampilkan tombol yang sama
- \[ \] Foto yang tidak menempel pada shift tetap tersembunyi

**E. Migrasi**

- \[ \] `CBGBDG01` memiliki `Branch_Folder_ID` dan `Evidence_Folder_ID` terisi
- \[ \] Spreadsheet masih terbaca service account
- \[ \] Panggilan `createBranchStructure` untuk `CBGBDG01` mengembalikan `reused = true`

**F. Otomatis**

- \[ \] `npm run test`
- \[ \] `npm run lint` (oxlint)
- \[ \] `npm run typecheck`
- \[ \] `npm run build`

---

## 15. Perubahan dari v1


| Bagian v1 | Perubahan di v2                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
|S0        | Ditambah keputusan 1 (Fase 0), 10 (kolom baru), 11 (batas per shift), 12 (registry-first). Keputusan 5 dipecah menjadi dua kunci. |
|S1.5      | Ditambah catatan ketidakkonsistenan `Folder_Drive_ID`.                                                                            |
|S1.10     | Baru: batas 5 foto yang dihitung lintas shift.                                                                                    |
|S3.1      | Ditambah action `ping`. `createBranchStructure` dibuat idempotent. `uploadPhoto` menerima `baseName`.                             |
|S3.2      | Dua kunci terpisah dan batas laju.                                                                                                |
|S3.3      | Penomoran `-N` dipindah ke GAS di bawah `LockService`. Ditambah `LockService` dan kemungkinan 503.                                |
|S3.4      | Pemeriksaan leluhur rekursif (v1 hanya induk langsung, sehingga menolak `Evidence`).                                              |
|S3.5      | Hardening disesuaikan dengan dua kunci dan batas laju.                                                                            |
|S3.7      | Ditambah langkah versi deployment dan uji `ping`.                                                                                 |
|S4        | `Folder_Drive_ID` tidak lagi ditulis, kolom baru di akhir.                                                                        |
|S5        | Urutan registry-first dengan tabel kegagalan. Pemanggilan ulang aman.                                                             |
|S6        | Ditambah verifikasi folder kosong, tanda `mycheck_branch`, dan uji `reused`.                                                      |
|S7.1      | Nama berkas tanpa `-urutan` di sisi Next.js.                                                                                      |
|S7.4      | Batas foto per shift. Urutan penulisan: upload dulu, baris `Photos` kemudian. Kolom `sha256`.                                     |
|S7.5      | Galat 503 untuk sibuk, dan pemetaan 401/403 dari GAS.                                                                             |
|S12       | Ditambah kunci bocor, konkurensi lintas script, dan titik gagal baris Photos.                                                     |
|S13       | Ditambah rekonsiliasi, perbaikan audit log, dan resolver shift sebagai dokumen terpisah.                                          |
|S14       | Ditambah uji regresi induk-langsung, pemisahan kunci, batas per shift, dan idempotensi.                                           |
| Teks      | Typo dan kalimat rusak diS3.3,S4, danS7.2 diperbaiki.                                                                          |
