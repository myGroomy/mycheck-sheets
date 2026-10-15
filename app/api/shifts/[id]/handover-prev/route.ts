// app/api/shifts/[id]/handover-prev/route.ts
// Baca handover dari shift sebelumnya di cabang yang sama (PRD 6.3.1).
//
// "Shift sebelumnya" = shift terakhir berstatus Ditutup/Ditutup paksa di
// cabang yang sama (PRD 6.3.1). Endpoint ini sengaja mengembalikan FIELD YANG
// SUDAH DIRESOLVE (label + nilai) dari snapshot milik shift sebelumnya sendiri,
// bukan hanya `values` mentah: label field berasal dari snapshot shift tersebut,
// sedangkan shift sekarang bisa memakai template berbeda. Kalau UI harus
// mencocokkan id dengan template shift berjalan, handover lama akan salah label
// atau hilang begitu admin mengubah konfigurasi handover.
import { NextResponse } from 'next/server';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { asBool, asStr, filterRows, listMonthlyRows } from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';
import { userNameMap } from '../../../../../lib/incidents';
import {
  handoverTabMonth,
  parseHandoverSnapshot,
  parseHandoverValues,
  parsePhotoIds,
  resolveHandoverFields,
  type HandoverFieldView,
} from '../../../../../lib/handover-fields';

const CLOSED_STATUSES = ['ditutup', 'ditutup_paksa'];

/** Ambil tab bulanan instance: tab_month, fallback shift_date, fallback bulan ini. */
function tabMonthOf(row: Record<string, unknown>): string {
  return handoverTabMonth(row);
}

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const pathParts = new URL(_req.url).pathname.split('/');
  const shiftInstanceId = pathParts[pathParts.length - 2];

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, spreadsheetId, branchId } = resolved;

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  // Shift sebelumnya: tertutup, dibuka sebelum shift ini, di cabang yang sama.
  const previousShifts = (
    await filterRows(spreadsheetId, 'ShiftInstances', (r) =>
      CLOSED_STATUSES.includes(asStr(r['status'])) &&
      asStr(r['opened_at']) < asStr(instance['opened_at'])
    )
  ).sort((a, b) => asStr(b['opened_at']).localeCompare(asStr(a['opened_at'])));

  const previousShift = previousShifts[0] ?? null;

  if (!previousShift) {
    return NextResponse.json({
      previousShift: null,
      handover: null,
      openIncidents: [],
      ack: { readAt: null, readByCount: 0, readByMe: false },
    });
  }

  const prevTabMonth = tabMonthOf(previousShift);
  const prevSnapshot = parseHandoverSnapshot(previousShift['template_snapshot']);

  // --- Handover + field terstruktur -------------------------------------
  let handover: {
    id: string;
    fields: HandoverFieldView[];
    freeText: string;
    photoIds: string[];
    submittedBy: string;
    submittedByName: string;
    submittedAt: string;
  } | null = null;

  const handovers = await listMonthlyRows(spreadsheetId, 'Handovers', prevTabMonth);
  const found = handovers.find((r) => asStr(r['shift_instance_id']) === asStr(previousShift['id']));

  if (found) {
    const values = parseHandoverValues(found['values']);
    // Field diambil dari snapshot shift SEBELUMNYA (bukan template sekarang),
    // dan nilai orphan tetap ditampilkan — keduanya sudah ditangani di
    // resolveHandoverFields() (lib/handover-fields.ts).
    const fields = resolveHandoverFields(prevSnapshot, values);
    const photoIds = parsePhotoIds(found['photo_ids']);
    const submittedBy = asStr(found['submitted_by']);
    const nameByUsername = await userNameMap();

    handover = {
      id: asStr(found['id']),
      fields,
      freeText: asStr(found['free_text']),
      photoIds,
      submittedBy,
      submittedByName: nameByUsername.get(submittedBy) ?? submittedBy,
      submittedAt: asStr(found['submitted_at']),
    };
  }

  // --- Incident masih open di cabang (PRD 6.3.1) ------------------------
  const openIncidents: {
    id: string;
    description: string;
    reportedAt: string;
    severity: string;
    categoryName: string;
  }[] = [];
  try {
    const index = await filterRows(
      spreadsheetId,
      'IncidentIndex',
      (r) => asStr(r['status']) === 'open' && !asBool(r['is_test'])
    );
    const byMonth = new Map<string, Record<string, unknown>[]>();
    for (const row of index) {
      const month = tabMonthOf(row);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(row);
    }
    const categoryNames = new Map<string, string>();
    for (const [month, rows] of byMonth) {
      const details = await listMonthlyRows(spreadsheetId, 'Incidents', month);
      const byId = new Map(details.map((r) => [asStr(r['id']), r]));
      for (const row of rows) {
        const detail = byId.get(asStr(row['incident_id']));
        if (!detail || asBool(detail['is_test'])) continue;
        const categoryId = asStr(detail['category_id']);
        let categoryName = categoryNames.get(categoryId);
        if (categoryName === undefined) {
          const cats = await filterRows(
            spreadsheetId,
            'IncidentCategories',
            (r) => asStr(r['id']) === categoryId
          );
          categoryName = asStr(cats[0]?.['name']) || 'Tanpa kategori';
          categoryNames.set(categoryId, categoryName);
        }
        openIncidents.push({
          id: asStr(detail['id']),
          description: asStr(detail['description']),
          reportedAt: asStr(detail['reported_at']),
          severity: asStr(detail['severity']) || 'normal',
          categoryName,
        });
      }
    }
    openIncidents.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  } catch {
    // Incident adalah informasi tambahan: kegagalan baca tidak boleh
    // membuat handover sebelumnya ikut gagal ditampilkan.
  }

  // --- Status "sudah dibaca" -------------------------------------------
  let readAt: string | null = null;
  let readByCount = 0;
  try {
    const ackTab = prevTabMonth;
    const acks = await listMonthlyRows(spreadsheetId, 'HandoverAcks', ackTab);
    const related = acks.filter((a) => asStr(a['handover_id']) === (handover?.id ?? ''));
    readByCount = related.length;
    const mine = related.find((a) => asStr(a['user_id']) === ctx.user.id);
    readAt = mine ? asStr(mine['read_at']) || null : null;
  } catch {
    // ack bersifat tambahan
  }

  return NextResponse.json({
    previousShift: {
      shiftInstanceId: asStr(previousShift['id']),
      name: prevSnapshot?.shift?.name || asStr(previousShift['shift_definition_id']),
      shiftDate: asStr(previousShift['shift_date']),
      closedAt: asStr(previousShift['closed_at']),
      status: asStr(previousShift['status']),
    },
    handover,
    openIncidents,
    ack: {
      readAt,
      readByCount,
      readByMe: readAt !== null,
    },
  });
});