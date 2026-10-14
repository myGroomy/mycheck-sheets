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
import type { Snapshot } from '../../../../../lib/db/snapshot';
import { formatReportValue } from '../../../../../lib/shared/report-values';
import { userNameMap } from '../../../../../lib/incidents';

interface HandoverFieldView {
  id: string;
  label: string;
  fieldType: string;
  inputTypes: string[];
  value: unknown;
  /** Nilai siap tampil; '—' bila kosong. */
  display: string;
  hasPhoto: boolean;
}

const CLOSED_STATUSES = ['ditutup', 'ditutup_paksa'];

/** Ambil tab bulanan instance: tab_month, fallback shift_date, fallback bulan ini. */
function tabMonthOf(row: Record<string, unknown>): string {
  const explicit = asStr(row['tab_month']).trim();
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
  const fromDate = asStr(row['shift_date']).trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(fromDate)) return fromDate;
  return new Date().toISOString().slice(0, 7);
}

/** Parse snapshot template; null bila rusak (jangan gagalkan seluruh respons). */
function parseSnapshot(raw: unknown): Snapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(asStr(raw)) as Snapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** True bila nilai field handover memuat id foto. */
function hasPhotoValue(value: unknown): boolean {
  if (!value) return false;
  // Bentuk tunggal: array id foto, mis. ['01J...', '01K...'].
  if (Array.isArray(value)) return value.some((item) => typeof item === 'string');
  // Bentuk jamak tipe: { foto: [...], teks: '...' }.
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      Array.isArray(item) ? item.some((x) => typeof x === 'string') : false
    );
  }
  return false;
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
  const prevSnapshot = parseSnapshot(previousShift['template_snapshot']);

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
    let values: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(asStr(found['values']) || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        values = parsed as Record<string, unknown>;
      }
    } catch {
      values = {};
    }

    // Field diambil dari snapshot shift SEBELUMNYA (bukan template sekarang).
    const snapshotFields = Array.isArray(prevSnapshot?.handover_fields)
      ? prevSnapshot!.handover_fields
      : [];
    // Nilai yang tidak ada di snapshot tetap ditampilkan agar tidak hilang:
    // admin bisa menambah field tanpa mengarsipkan shift lama.
    const knownIds = new Set(snapshotFields.map((f) => f.id));
    const extraIds = Object.keys(values).filter((id) => !knownIds.has(id));

    const fields: HandoverFieldView[] = [
      ...snapshotFields.map((field) => {
        const inputTypes = field.input_types?.length ? field.input_types : [field.field_type];
        const value = values[field.id];
        const onlyPhoto = inputTypes.length === 1 && inputTypes[0] === 'foto';
        return {
          id: field.id,
          label: field.label,
          fieldType: field.field_type,
          inputTypes,
          value,
          display: onlyPhoto
            ? `${Array.isArray(value) ? value.length : 0} foto terlampir`
            : (formatReportValue(value) || '—'),
          hasPhoto: hasPhotoValue(value),
        };
      }),
      ...extraIds.map((id) => {
        const value = values[id];
        return {
          id,
          // Field tidak lagi ada di template: tampilkan sebagai id agar admin
          // tahu konfigurasi mana yang berubah, tanpa menyembunyikan isinya.
          label: `Field ${id} (sudah dihapus dari template)`,
          fieldType: 'teks',
          inputTypes: ['teks'],
          value,
          display: formatReportValue(value) || '—',
          hasPhoto: hasPhotoValue(value),
        };
      }),
    ];

    const photoIds = Array.isArray(found['photo_ids'])
      ? (found['photo_ids'] as unknown[]).map(String)
      : (() => {
          try {
            const parsed = JSON.parse(asStr(found['photo_ids']) || '[]') as unknown;
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })();

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