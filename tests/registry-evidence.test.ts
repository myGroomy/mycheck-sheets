// tests/registry-evidence.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CABANG_HEADERS } from '../lib/google/registry-admin';
import { MONTHLY_SHEETS } from '../lib/google/branch-schema';

test('CABANG_HEADERS: Branch_Folder_ID dan Evidence_Folder_ID ada di akhir', () => {
  const len = CABANG_HEADERS.length;
  assert.equal(CABANG_HEADERS[len - 2], 'Branch_Folder_ID');
  assert.equal(CABANG_HEADERS[len - 1], 'Evidence_Folder_ID');

  // Pastikan kolom lama tidak bergeser (urutan 8 kolom pertama tetap persis sama)
  assert.deepEqual(CABANG_HEADERS.slice(0, 8), [
    'Cabang_ID',
    'Nama_Cabang',
    'Kode',
    'Timezone',
    'Spreadsheet_ID',
    'Folder_Drive_ID',
    'Aktif',
    'Alamat',
  ]);
});

test('branch-schema: Photos memiliki kolom sha256 di akhir', () => {
  const photosHeaders = MONTHLY_SHEETS['Photos'];
  assert.ok(photosHeaders, 'Sheet Photos harus terdefinisi di MONTHLY_SHEETS');
  const lastCol = photosHeaders[photosHeaders.length - 1];
  assert.equal(lastCol, 'sha256');

  // Pastikan kolom penting tetap ada di posisi awal
  assert.equal(photosHeaders[0], 'id');
  assert.equal(photosHeaders[1], 'shift_instance_id');
  assert.equal(photosHeaders[5], 'file_ref');
});
