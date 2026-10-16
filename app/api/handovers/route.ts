// app/api/handovers/route.ts
// Riwayat handover (serah terima) lintas shift untuk cabang yang bisa diakses.
//
// Berbeda dengan `/api/shifts/[id]/handover-prev` yang hanya mengembalikan SATU
// shift sebelumnya dan butuh shift yang sedang berjalan sebagai jangkar, endpoint
// ini berbasis CABANG dan tidak butuh shift yang sedang terbuka. Petugas bisa
// karena itu melihat shift sebelumnya maupun shift sebelum-sebelumnya, bahkan di
// luar jam shift.
//
// Batasan kuota Google Sheets: sheet bulanan dibaca SEKALI per bulan lalu
// dipakai ulang untuk semua shift di bulan tersebut (lihat pengelompokan di
// bawah), bukan satu pemanggilan per shift.

import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/api-auth';
import { getCabangList, resolveCabang } from '../../../lib/google/registry';
import { asStr, listMonthlyRows, listMonthlyRowsFresh, listRows } from '../../../lib/store';
import { userNameMap } from '../../../lib/incidents';
import {
  countFilledFields,
  handoverTabMonth,
  isClosedShiftStatus,
  parseHandoverSnapshot,
  parseHandoverValues,
  parsePhotoIds,
  resolveHandoverFields,
  type HandoverFieldView,
} from '../../../lib/handover-fields';

export interface HandoverHistoryEntry {
  shiftInstanceId: string;
  branchId: string;
  branchName: string;
  shiftName: string;
  shiftDate: string;
  closedAt: string;
  status: string;
  handover: {
    id: string;
    fields: HandoverFieldView[];
    freeText: string;
    photoIds: string[];
    submittedBy: string;
    submittedByName: string;
    submittedAt: string;
  } | null;
  filledCount: number;
  photoCount: number;
  ack: { readAt: string | null; readByCount: number; readByMe: boolean };
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (req, ctx, _session) => {
  const url = new URL(req.url);
  const branchFilter = url.searchParams.get('branchId')?.trim() ?? '';
  const parsedLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : DEFAULT_LIMIT)
  );

  const nameByUsername = await userNameMap();
  const cabangs = await getCabangList();
  const entries: HandoverHistoryEntry[] = [];

  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    if (branchFilter && branchFilter !== cabang.Cabang_ID) continue;

    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }

    // 1. Shift yang sudah tutup, terbaru dulu.
    //    ShiftInstances = sheet STATIS (bukan bulanan), jadi dibaca langsung.
    let instances: Record<string, unknown>[];
    try {
      instances = (await listRows(spreadsheetId, 'ShiftInstances')).filter((r) =>
        isClosedShiftStatus(asStr(r['status']))
      );
    } catch {
      continue;
    }
    instances.sort((a, b) => asStr(b['opened_at']).localeCompare(asStr(a['opened_at'])));
    const selected = instances.slice(0, limit);
    if (selected.length === 0) continue;

    // 2. Kelompokkan per bulan supaya tiap sheet bulanan dibaca satu kali.
    //    Pakai fresh read (bukan cache 15s) supaya data yang baru ditulis
    //    (handover submit / ack) langsung terlihat.
    const months = [...new Set(selected.map((r) => handoverTabMonth(r)))];
    const handoversByMonth = new Map<string, Record<string, unknown>[]>();
    const acksByMonth = new Map<string, Record<string, unknown>[]>();
    for (const month of months) {
      handoversByMonth.set(month, await listMonthlyRowsFresh(spreadsheetId, 'Handovers', month));
      acksByMonth.set(month, await listMonthlyRowsFresh(spreadsheetId, 'HandoverAcks', month));
    }

    // 3. Rakit entri per shift.
    for (const instance of selected) {
      const month = handoverTabMonth(instance);
      const instanceId = asStr(instance['id']);
      const snapshot = parseHandoverSnapshot(instance['template_snapshot']);

      const row = (handoversByMonth.get(month) ?? []).find(
        (h) => asStr(h['shift_instance_id']) === instanceId
      );

      let handover: HandoverHistoryEntry['handover'] = null;
      let filledCount = 0;
      let photoCount = 0;

      if (row) {
        const fields = resolveHandoverFields(snapshot, parseHandoverValues(row['values']));
        const photoIds = parsePhotoIds(row['photo_ids']);
        const submittedBy = asStr(row['submitted_by']);
        filledCount = countFilledFields(fields);
        photoCount = fields.filter((field) => field.hasPhoto).length;
        handover = {
          id: asStr(row['id']),
          fields,
          freeText: asStr(row['free_text']),
          photoIds,
          submittedBy,
          submittedByName: nameByUsername.get(submittedBy) ?? submittedBy,
          submittedAt: asStr(row['submitted_at']),
        };
      }

      // Status "sudah dibaca" milik pengguna ini.
      let readAt: string | null = null;
      let readByCount = 0;
      if (handover) {
        const related = (acksByMonth.get(month) ?? []).filter(
          (a) => asStr(a['handover_id']) === handover!.id
        );
        readByCount = related.length;
        const mine = related.find((a) => asStr(a['user_id']) === ctx.user.id);
        readAt = mine ? asStr(mine['read_at']) || null : null;
      }

      entries.push({
        shiftInstanceId: instanceId,
        branchId: cabang.Cabang_ID,
        branchName: (cabang['Nama_Cabang'] as string) || cabang.Cabang_ID,
        shiftName: snapshot?.shift?.name || asStr(instance['shift_definition_id']),
        shiftDate: asStr(instance['shift_date']),
        closedAt: asStr(instance['closed_at']),
        status: asStr(instance['status']),
        handover,
        filledCount,
        photoCount,
        ack: { readAt, readByCount, readByMe: readAt !== null },
      });
    }
  }

  // Terbaru lebih dulu, lintas cabang.
  entries.sort((a, b) =>
    (b.closedAt || b.shiftDate).localeCompare(a.closedAt || a.shiftDate)
  );

  const branchOptions = cabangs
    .filter((c) => ctx.branchIds.includes(c.Cabang_ID) && c.Spreadsheet_ID)
    .map((c) => ({ id: c.Cabang_ID, name: (c['Nama_Cabang'] as string) || c.Cabang_ID }));

  const response = NextResponse.json({ entries: entries.slice(0, limit), branches: branchOptions });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
});
