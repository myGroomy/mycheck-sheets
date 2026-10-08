// lib/concurrency.ts
// Rekonsiliasi untuk aturan yang di PostgreSQL dijaga index/lock, sedangkan
// Google Sheets hanya bisa "cek lalu tulis" — dan langkah itu bisa raced.
//
// Strategi: ID resource bersifat deterministik (lihat `lib/ids.ts`) sehingga
// dua request paralel menulis baris dengan ID yang sama. Setelah menulis,
// setiap penulis membandingkan baris kanonik (baris paling awal) dengan nilai
// `completed_at` yang IA SENDIRI tulis. Kalau sama, dia yang menang; kalau
// tidak, berarti ada penulis lain yang lebih dulu dan dia kalah (409).
//
// Kenapa `completed_at` bisa jadi penanda? Penulisannya bersamaan dengan
// `completed_at`, jadi tiap baris membawa timestamp yang hanya dibuat oleh
// penulisnya. Perbandingan string ISO (presisi milidetik) memberi penentu
// pemenang yang unik dalam kondisi normal.
//
// Batas yang jujur: bila dua request benar-benar mendarat pada milidetik yang
// sama, keduanya bisa merasa menang. Karena setiap tulisan ke Google Sheets
// memakan ~300–1000 ms, jendela tabrakan ini jauh lebih kecil daripada
// check-then-insert yang dulu selalu gagal.
//
// Catatan: ini PERSEMPIT celah balapan, tidak menghilangkannya sepenuhnya.
// Tidak ada row lock di Sheets.

import { listRowsWithNumber, updateRow, asStr } from './store';

interface EntryRowInfo {
  rowNumber: number;
  id: string;
  completedAt: string;
}

/**
 * Semua baris entry untuk (shiftInstance, pointRef), urut dari yang ditulis
 * paling awal. Baris pertama adalah yang kanonik.
 */
export async function listEntryRows(
  spreadsheetId: string,
  sheet: string,
  shiftInstanceIdValue: string,
  pointRef: string
): Promise<EntryRowInfo[]> {
  const rows = await listRowsWithNumber(spreadsheetId, sheet);
  return rows
    .filter(
      (r) =>
        asStr(r.data['shift_instance_id']) === shiftInstanceIdValue &&
        asStr(r.data['point_ref']) === pointRef
    )
    .map((r) => ({
      rowNumber: r.rowNumber,
      id: asStr(r.data['id']),
      completedAt: asStr(r.data['completed_at']),
    }));
}

/**
 * Apakah baris yang baru ditulis penulis ini adalah baris kanonik?
 * `myCompletedAt` harus persis sama dengan nilai yang ia tulis.
 */
export async function isCanonicalEntry(
  spreadsheetId: string,
  sheet: string,
  shiftInstanceIdValue: string,
  pointRef: string,
  myCompletedAt: string
): Promise<{ winner: boolean; canonical: EntryRowInfo | null; rows: EntryRowInfo[] }> {
  const rows = await listEntryRows(spreadsheetId, sheet, shiftInstanceIdValue, pointRef);
  if (rows.length === 0) return { winner: false, canonical: null, rows };
  const canonical = rows[0];
  return { winner: canonical.completedAt === myCompletedAt, canonical, rows };
}

/**
 * Kembalikan ke 'belum' semua baris entry untuk satu point KECUALI baris
 * kanonik. Karena ID entry deterministik, semua baris itu mewakili satu entri
 * logis — jadi hanya boleh satu yang terisi.
 *
 * Sengaja tidak mencoba menebak "baris mana milik pemanggil": beberapa
 * pemanggil yang kalah bisa membaca sheet pada waktu yang sama dan memilih
 * target yang sama, sehingga baris lain tetap terisi. Mengembalikan seluruh
 * duplikat idempoten dan aman dipanggil bersamaan.
 */
export async function resetDuplicateEntryRows(
  spreadsheetId: string,
  sheet: string,
  rows: EntryRowInfo[],
  canonicalRowNumber: number,
  nowIso: string
): Promise<number> {
  let reset = 0;
  for (const row of rows) {
    if (row.rowNumber === canonicalRowNumber || row.completedAt === '') continue;
    await updateRow(spreadsheetId, sheet, row.rowNumber, {
      state: 'belum',
      value: '',
      out_of_range: false,
      completed_by: '',
      completed_at: '',
      timing_label: '',
      timing_delta_minutes: '',
      skip_reason: '',
      updated_at: nowIso,
    });
    reset++;
  }
  return reset;
}

/**
 * Void baris duplikat ShiftInstances yang memakai ID sama, selain baris paling
 * awal. Kembalikan jumlah baris yang di-void.
 */
export async function voidDuplicateShiftInstances(
  spreadsheetId: string,
  instanceId: string
): Promise<number> {
  const rows = (await listRowsWithNumber(spreadsheetId, 'ShiftInstances')).filter(
    (r) => asStr(r.data['id']) === instanceId
  );
  if (rows.length <= 1) return 0;

  const [, ...duplicates] = rows;
  let voided = 0;
  for (const dup of duplicates) {
    if (asStr(dup.data['status']) === 'void') continue;
    await updateRow(spreadsheetId, 'ShiftInstances', dup.rowNumber, {
      status: 'void',
      void_reason: 'duplikat konkuren (BR-01)',
      void_by: 'system',
      void_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    voided++;
  }
  return voided;
}