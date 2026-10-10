// scripts/dev-add-cabang-alamat.ts —(one-off, boleh dihapus setelah dijalankan)
// Tambah kolom `Alamat` ke header sheet Registry.Daftar_Cabang.
//
// PRD ADM-BR-01 menyebut cabang punya "alamat singkat", tapi DATABASE_SCHEMA.md
// lama tidak punya kolomnya sehingga input Alamat di form admin discarding
// tanpa disimpan. Kolom baru ditaruh di AKHIR supaya kolom lama tidak bergeser
// dan data existing tidak perlu dimigrasi.

import { writeCells } from '../lib/google/sheets';
import { getRegistrySpreadsheetId } from '../lib/google/registry';
import { readSheetData } from '../lib/google/sheets';

async function main() {
  const registryId = getRegistrySpreadsheetId();
  const { headers } = await readSheetData(registryId, 'Daftar_Cabang');

  console.log('header saat ini :', headers.join(' | '));

  if (headers.includes('Alamat')) {
    console.log('kolom Alamat sudah ada tidak ada yang diubah.');
    return;
  }

  const col = headers.length; // 0-based -> kolom berikutnya
  const letter = String.fromCharCode(65 + col); // A..Z cukup untuk Daftar_Cabang

  await writeCells(registryId, [
    { range: `Daftar_Cabang!${letter}1`, value: 'Alamat' },
  ]);

  console.log(`kolom Alamat ditambahkan di ${letter}1`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});