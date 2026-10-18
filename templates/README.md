# MyCheck Spreadsheet Templates

## Files

- `mycheck-registry.xlsx`: workbook Registry kosong.
- `mycheck-template-flat.xlsx`: workbook template cabang kosong dengan
  `schema_version=2` dan `period_mode=flat`.
- `mycheck-template-yearly.xlsx`: alias kompatibilitas; isinya juga sudah
  `period_mode=flat`.

## Upload order

1. Upload `mycheck-registry.xlsx` ke Google Sheets.
2. Upload `mycheck-template-flat.xlsx` ke Google Sheets.
3. Salin ID template cabang ke `Template_Referensi!A2` pada Registry.
4. Untuk cabang baru, copy spreadsheet template; jangan mengedit template
   master sebagai data operasional.
5. Daftarkan spreadsheet hasil copy di `Daftar_Cabang` melalui alur setup
   cabang.

Template cabang memakai sheet transaksi generik tanpa suffix tahun/bulan.
Tahun hanya menjadi nilai pada kolom tanggal dan dipakai saat user menjalankan
proses arsip manual.
