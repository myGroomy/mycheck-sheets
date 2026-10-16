// tests/photo-limit.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { addSheet } from './helpers/mock-sheets';
import { seedRegistry, branchSpreadsheetId, resetRegistryCache } from './helpers/mock-registry';
import { installSessionStub, setSession, clearSession } from './helpers/mock-auth';
import { STATIC_SHEETS, MONTHLY_SHEETS } from '../lib/google/branch-schema';

installSessionStub();

const BASE = 'http://localhost:3000';
const CAB1 = 'CAB1';
const SPREADSHEET_ID = branchSpreadsheetId(CAB1);
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

function makeSnapshot(pointRef: string) {
  return JSON.stringify({
    v: 1,
    shift: { id: 'SD1', name: 'Shift Pagi', start_time: '07:00', end_time: '15:00', crosses_midnight: false },
    settings: { tolerance_default_minutes: 15, timezone: 'Asia/Jakarta' },
    categories: [
      {
        id: 'C1',
        name: 'Kebersihan',
        sort_order: 1,
        points: [
          {
            point_ref: pointRef,
            title: 'Lantai ruang tamu',
            instruction: null,
            input_type: 'foto',
            is_required: true,
          },
        ],
      },
    ],
  });
}

function createUploadRequest({
  shiftInstanceId,
  pointRef,
}: {
  shiftInstanceId: string;
  pointRef: string;
}): NextRequest {
  const formData = new FormData();
  const file = new File(['dummy-webp-binary-content'], 'bukti.webp', { type: 'image/webp' });
  formData.set('file', file);
  formData.set('ownerType', 'entry');
  formData.set('ownerId', pointRef);
  formData.set('shiftInstanceId', shiftInstanceId);

  return new NextRequest(`${BASE}/api/photos/upload`, {
    method: 'POST',
    body: formData,
    headers: {
      'X-Requested-With': 'fetch',
    },
  });
}

test('Batas 5 foto per shift: purged tidak dihitung, dan shift B tetap bisa upload walau shift A sudah 5 foto', async () => {
  resetRegistryCache();

  // Registry dengan Evidence_Folder_ID terisi
  const workbook = seedRegistry([
    {
      id: CAB1,
      name: 'Cabang 1',
      code: 'CBG01',
      active: true,
      spreadsheetId: SPREADSHEET_ID,
      evidenceFolderId: 'ev-folder-123',
    },
  ]);

  const snapshotJson = makeSnapshot('POINT-100');

  // Sheet ShiftInstances dengan dua shift berjalan pada tanggal sama
  addSheet(
    workbook,
    'ShiftInstances',
    STATIC_SHEETS.ShiftInstances,
    [
      {
        id: 'shift-A',
        shift_definition_id: 'SD1',
        shift_date: '2026-10-16',
        tab_month: CURRENT_MONTH,
        status: 'berjalan',
        template_snapshot: snapshotJson,
      },
      {
        id: 'shift-B',
        shift_definition_id: 'SD1',
        shift_date: '2026-10-16',
        tab_month: CURRENT_MONTH,
        status: 'berjalan',
        template_snapshot: snapshotJson,
      },
    ],
    SPREADSHEET_ID
  );

  // Sheet Photos_{YYYY-MM}
  // 4 foto aktif di shift-A + 1 foto PURGED di shift-A (total 5 foto fisik di sheet, tapi hanya 4 aktif)
  addSheet(
    workbook,
    `Photos_${CURRENT_MONTH}`,
    MONTHLY_SHEETS.Photos,
    [
      { id: 'p1', shift_instance_id: 'shift-A', owner_type: 'entry', owner_id: 'POINT-100', status: 'uploaded' },
      { id: 'p2', shift_instance_id: 'shift-A', owner_type: 'entry', owner_id: 'POINT-100', status: 'uploaded' },
      { id: 'p3', shift_instance_id: 'shift-A', owner_type: 'entry', owner_id: 'POINT-100', status: 'uploaded' },
      { id: 'p4', shift_instance_id: 'shift-A', owner_type: 'entry', owner_id: 'POINT-100', status: 'uploaded' },
      { id: 'p5', shift_instance_id: 'shift-A', owner_type: 'entry', owner_id: 'POINT-100', status: 'purged' },
    ],
    SPREADSHEET_ID
  );

  setSession({
    username: 'dea',
    nama: 'Petugas Dea',
    role: 'petugas',
    cabangId: CAB1,
  });

  const origUrl = process.env.MYCHECK_GAS_URL;
  const origKey = process.env.MYCHECK_GAS_UPLOAD_KEY;
  const origFetch = globalThis.fetch;

  process.env.MYCHECK_GAS_URL = 'https://mock.gas/exec';
  process.env.MYCHECK_GAS_UPLOAD_KEY = 'up_test_key';

  let gasCallCount = 0;
  globalThis.fetch = (async () => {
    gasCallCount++;
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          fileId: `drive-file-${gasCallCount}`,
          fileUrl: `https://drive.google.com/file/d/drive-file-${gasCallCount}/view`,
          fileName: `CBG01-16102026-pagi-dea-${gasCallCount}.webp`,
          sizeBytes: 1024,
        },
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const { POST } = await import('../app/api/photos/upload/route');

    // 1. Upload ke-5 pada shift-A (karena yang ke-5 sebelumnya purged, ini jadi foto aktif ke-5) -> harus SUKSES
    const req1 = createUploadRequest({ shiftInstanceId: 'shift-A', pointRef: 'POINT-100' });
    const res1 = await POST(req1);
    assert.equal(res1.status, 200, 'Upload foto aktif ke-5 harus berhasil karena foto purged tidak dihitung');
    const body1 = (await res1.json()) as { status: string; photo_id: string };
    assert.equal(body1.status, 'uploaded');

    // 2. Upload ke-6 pada shift-A -> harus DITOLAK 400 karena sudah ada 5 foto aktif (uploaded)
    const req2 = createUploadRequest({ shiftInstanceId: 'shift-A', pointRef: 'POINT-100' });
    const res2 = await POST(req2);
    assert.equal(res2.status, 400, 'Upload foto ke-6 pada shift yang sama harus ditolak');
    const body2 = (await res2.json()) as { error: string };
    assert.ok(body2.error.includes('Maksimal 5 foto'));

    // 3. Upload pada shift-B untuk pointRef yang sama pada hari yang sama -> harus SUKSES (batas per shift!)
    const req3 = createUploadRequest({ shiftInstanceId: 'shift-B', pointRef: 'POINT-100' });
    const res3 = await POST(req3);
    assert.equal(res3.status, 200, 'Shift B harus tetap bisa mengunggah foto untuk pertanyaan yang sama');
    const body3 = (await res3.json()) as { status: string; photo_id: string };
    assert.equal(body3.status, 'uploaded');

  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_UPLOAD_KEY = origKey;
    globalThis.fetch = origFetch;
    clearSession();
  }
});
