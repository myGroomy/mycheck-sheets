// tests/helpers/mock-sheets.ts
// Memasang fake Google Sheets client ke `lib/google/client` supaya modul
// store/registry/template-service yang diuji tidak pernah memanggil API nyata.
//
// CARA KERJA: source memanggil `getSheetsClient()` yang meng-cache client di
// module scope `lib/google/client.ts`. Modul ini mengisi `require.cache` entry
// itu SEBELUM ada modul source lain yang memuatnya, sehingga `require`/
// `import()` berikutnya menerima fake.
//
// PENTING: file ini tidak boleh meng-import modul lib/ secara statis di bagian
// atas. Impor statis dievaluasi sebelum body modul berjalan, sehingga
// `lib/google/sheets` (yang meng-import client asli) akan termuat lebih dulu
// dan menyimpan closure client asli. Semua akses ke modul source harus lewat
// `require` lazy di dalam fungsi.

import { createRequire } from 'node:module';
import {
  DEFAULT_SPREADSHEET_ID,
  addSheet,
  createFakeSheetsClient,
  createWorkbook,
  getSheet,
  sheetKey,
  type FakeSheetsClient,
  type FakeWorkbook,
} from './fake-sheets';

// Env minimal yang dibaca registry sebelum fake client dipakai.
process.env.REGISTRY_SPREADSHEET_ID ??= 'registry-uji';
process.env.STOKIS_API_KEY ??= 'kunci-uji-yang-cukup-panjang-untuk-rotation';

const require = createRequire(__filename);

const CLIENT_MODULE = require.resolve('../../lib/google/client');
const SHEETS_MODULE = require.resolve('../../lib/google/sheets');

let workbook: FakeWorkbook = createWorkbook();
let client: FakeSheetsClient = createFakeSheetsClient(workbook);

require.cache[CLIENT_MODULE] = {
  id: CLIENT_MODULE,
  filename: CLIENT_MODULE,
  loaded: true,
  children: [],
  paths: [],
  exports: {
    getSheetsClient: () => client,
    getDriveClient: () => {
      throw new Error('Drive client tidak dipakai pada test ini');
    },
  },
} as unknown as NodeModule;

/** Ganti workbook + client untuk test berikutnya; cache baca juga dibuang. */
export function useWorkbook(): {
  workbook: FakeWorkbook;
  client: FakeSheetsClient;
} {
  workbook = createWorkbook();
  client = createFakeSheetsClient(workbook);
  // sheets.ts boleh sudah dimuat (melewati import lazy), jadi invalidate
  // dilakukan secara defensif.
  try {
    (require(SHEETS_MODULE) as { invalidateSheetCache: (id?: string) => void })
      .invalidateSheetCache();
  } catch {
    // belum termuat; tidak ada cache untuk dibuang
  }
  return { workbook, client };
}

export { DEFAULT_SPREADSHEET_ID, addSheet, createWorkbook, getSheet, sheetKey };
export type { FakeSheetsClient, FakeWorkbook };