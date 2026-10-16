// tests/branch-create.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { seedRegistry, REGISTRY_SPREADSHEET_ID } from './helpers/mock-registry';
import { getSheet, type FakeWorkbook } from './helpers/mock-sheets';
import { installSessionStub, setSession, clearSession, makeRequest } from './helpers/mock-auth';
import { asBool } from '../lib/store';

installSessionStub();

const BASE = 'http://localhost:3000';

function getRegistryRows(workbook: FakeWorkbook) {
  const sheet = getSheet(workbook, 'Daftar_Cabang', REGISTRY_SPREADSHEET_ID);
  if (!sheet || sheet.values.length <= 1) return [];
  const headers = sheet.values[0] as string[];
  return sheet.values.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

test('POST /api/admin/branches: 503 jika GAS belum dikonfigurasi dan tidak menulis Registry', async () => {
  const workbook = seedRegistry([]);

  setSession({
    username: 'admin1',
    nama: 'Admin',
    role: 'admin',
    cabangId: '',
  });

  const origUrl = process.env.MYCHECK_GAS_URL;
  const origKey = process.env.MYCHECK_GAS_ADMIN_KEY;
  delete process.env.MYCHECK_GAS_URL;
  delete process.env.MYCHECK_GAS_ADMIN_KEY;

  try {
    const { POST } = await import('../app/api/admin/branches/route');
    const req = makeRequest(
      'POST',
      `${BASE}/api/admin/branches`,
      { name: 'Cabang Baru', code: 'CBG01', timezone: 'Asia/Jakarta' }
    );

    const res = await POST(req);
    assert.equal(res.status, 503);
    const data = (await res.json()) as { error: string };
    assert.ok(data.error.includes('Google Apps Script'));

    const rows = getRegistryRows(workbook);
    assert.equal(rows.length, 0, 'Registry tidak boleh ditulisi saat GAS belum siap');
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_ADMIN_KEY = origKey;
    clearSession();
  }
});

test('POST /api/admin/branches: GAS gagal meninggalkan baris Aktif=false; pemanggilan ulang tidak membuat baris ganda', async () => {
  const workbook = seedRegistry([]);

  setSession({
    username: 'admin1',
    nama: 'Admin',
    role: 'admin',
    cabangId: '',
  });

  const origUrl = process.env.MYCHECK_GAS_URL;
  const origKey = process.env.MYCHECK_GAS_ADMIN_KEY;
  const origFetch = globalThis.fetch;

  process.env.MYCHECK_GAS_URL = 'https://mock.gas/exec';
  process.env.MYCHECK_GAS_ADMIN_KEY = 'adm_test_key';

  try {
    const { POST } = await import('../app/api/admin/branches/route');

    // 1. Simulasi kegagalan GAS
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: 502,
          error: 'Drive timeout',
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const req1 = makeRequest(
      'POST',
      `${BASE}/api/admin/branches`,
      { name: 'Cabang Sukses', code: 'CBG02', timezone: 'Asia/Jakarta' }
    );

    const res1 = await POST(req1);
    assert.equal(res1.status, 502);

    const rowsAfterFail = getRegistryRows(workbook);
    assert.equal(rowsAfterFail.length, 1);
    assert.equal(rowsAfterFail[0]['Kode'], 'CBG02');
    assert.equal(asBool(rowsAfterFail[0]['Aktif']), false);
    assert.equal(rowsAfterFail[0]['Spreadsheet_ID'], '');
    assert.equal(rowsAfterFail[0]['Folder_Drive_ID'], '', 'Folder_Drive_ID tidak boleh diisi folder root');

    // 2. Pemanggilan ulang (retry) setelah GAS pulih
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            branchFolderId: 'folder-cbg02',
            spreadsheetId: 'sheet-cbg02',
            evidenceFolderId: 'ev-cbg02',
            reused: true,
          },
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const req2 = makeRequest(
      'POST',
      `${BASE}/api/admin/branches`,
      { name: 'Cabang Sukses', code: 'CBG02', timezone: 'Asia/Jakarta' }
    );

    const res2 = await POST(req2);
    assert.equal(res2.status, 201);
    const body2 = (await res2.json()) as { branch: { isActive: boolean; spreadsheetId: string; branchFolderId: string; evidenceFolderId: string; reused: boolean } };
    assert.equal(body2.branch.isActive, true);
    assert.equal(body2.branch.spreadsheetId, 'sheet-cbg02');
    assert.equal(body2.branch.branchFolderId, 'folder-cbg02');
    assert.equal(body2.branch.evidenceFolderId, 'ev-cbg02');
    assert.equal(body2.branch.reused, true);

    // Pastikan tidak ada baris ganda di Registry
    const rowsAfterRetry = getRegistryRows(workbook);
    assert.equal(rowsAfterRetry.length, 1, 'Retry tidak boleh menambah baris baru');
    assert.equal(asBool(rowsAfterRetry[0]['Aktif']), true);
    assert.equal(rowsAfterRetry[0]['Spreadsheet_ID'], 'sheet-cbg02');
    assert.equal(rowsAfterRetry[0]['Branch_Folder_ID'], 'folder-cbg02');
    assert.equal(rowsAfterRetry[0]['Evidence_Folder_ID'], 'ev-cbg02');

    // 3. Pemanggilan ketiga saat cabang sudah aktif -> ditolak 400
    const req3 = makeRequest(
      'POST',
      `${BASE}/api/admin/branches`,
      { name: 'Cabang Sukses', code: 'CBG02', timezone: 'Asia/Jakarta' }
    );
    const res3 = await POST(req3);
    assert.equal(res3.status, 400);
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_ADMIN_KEY = origKey;
    globalThis.fetch = origFetch;
    clearSession();
  }
});
