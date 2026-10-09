// lib/domain/incident-service.ts
// Domain service untuk operasi incident.

import type { AuthContext } from '../api-auth';
import { appendAuditLogFor } from '../db/audit';
import { getServerTime } from '../db/server-time';
import {
  asBool,
  asStr,
  filterRows,
  insertRow,
  listMonthlyRows,
} from '../store';
import { resolveCabang, getCabangList } from '../google/registry';
import {
  incidentTabMonth,
  pushNotification,
  updateIncidentRow,
  findIncidentAcrossBranches,
  categoryNameMap,
  userNameMap,
} from '../incidents';

export interface IncidentRow {
  id: string;
  branchId: string;
  categoryId: string;
  description: string;
  occurredAt: string;
  reportedAt: string;
  reportedBy: string;
  status: string;
  severity: string | null;
  outsideShift: boolean;
  shiftInstanceId: string | null;
}

export interface IncidentCategory {
  id: string;
  name: string;
}

export async function listIncidentsAcrossBranches(
  ctx: AuthContext
): Promise<IncidentRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cabangs = await getCabangList();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const categories = await categoryNameMap(ctx);
  const nameByUsername = await userNameMap();
  const incidents: IncidentRow[] = [];

  for (const cabang of cabangs) {
    if (!ctx.branchIds.includes(cabang.Cabang_ID) || !cabang.Spreadsheet_ID) continue;
    let spreadsheetId = '';
    try {
      spreadsheetId = (await resolveCabang(cabang.Cabang_ID)).spreadsheetId;
    } catch {
      continue;
    }

    const indexed = await filterRows(spreadsheetId, 'IncidentIndex', () => true);
    const byMonth = new Map<string, Record<string, unknown>[]>();
    for (const idx of indexed) {
      if (asBool(idx['is_test'])) continue;
      const m = asStr(idx['tab_month']);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(idx);
    }

    for (const [month, list] of byMonth) {
      const rows = await listMonthlyRows(spreadsheetId, 'Incidents', month);
      const byId = new Map(rows.map((r) => [asStr(r['id']), r]));
      for (const idx of list) {
        const row = byId.get(asStr(idx['incident_id']));
        if (!row || asBool(row['is_test'])) continue;
        incidents.push({
          id: asStr(row['id']),
          branchId: cabang.Cabang_ID,
          categoryId: asStr(row['category_id']),
          description: asStr(row['description']),
          occurredAt: asStr(row['occurred_at']),
          reportedAt: asStr(row['reported_at']),
          reportedBy: nameByUsername.get(asStr(row['reported_by'])) ?? asStr(row['reported_by']),
          status: asStr(row['status']),
          severity: asStr(row['severity']) || null,
          outsideShift: asBool(row['outside_shift']),
          shiftInstanceId: asStr(row['shift_instance_id']) || null,
        });
      }
    }
  }

  incidents.sort((a, b) => String(b['reportedAt']).localeCompare(String(a['reportedAt'])));
  return incidents;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateIncidentStatus(
  ctx: AuthContext,
  incidentId: string,
  status: 'open' | 'selesai'
): Promise<{ success: boolean }> {
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) throw new Error('Incident tidak ditemukan');
  const { spreadsheetId, branchId, incident } = located;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const tabMonth = incidentTabMonth(incident);
  const before = asStr(incident['status']);

  if (before === status) return { success: true };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const now = getServerTime().toISOString();
  const ok = await updateIncidentRow(spreadsheetId, tabMonth, incidentId, {
    status,
    status_changed_by: ctx.user.id,
    status_changed_at: now,
    updated_at: now,
    version: (Number(incident['version']) || 1) + 1,
  });
  if (!ok) throw new Error('Incident tidak ditemukan');

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'update_incident_status',
    objectType: 'incident',
    objectId: incidentId,
    branchId,
    shiftInstanceId: asStr(incident['shift_instance_id']) || undefined,
    before: { status: before },
    after: { status },
  });

  try {
    await pushNotification(spreadsheetId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId: asStr(incident['reported_by']),
      type: 'incident_status',
      title: `Incident ${status === 'selesai' ? 'selesai' : 'dibuka kembali'}`,
      body: asStr(incident['description']).slice(0, 140),
      link: `/incident/${incidentId}`,
    });
  } catch {
    // best-effort
  }

  return { success: true };
}

export async function linkIncidentToShift(
  ctx: AuthContext,
  incidentId: string,
  shiftInstanceId: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ success: boolean }> {
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) throw new Error('Incident tidak ditemukan');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { spreadsheetId, branchId, incident, tabMonth } = located;

  if (incident['shift_instance_id'] === shiftInstanceId) {
    return { success: true };
  }

  const candidates = await filterRows(
    spreadsheetId,
    'ShiftInstances',
    (r) => asStr(r['id']) === shiftInstanceId
  );
  if (!candidates[0]) throw new Error('Shift tidak ditemukan di cabang ini.');

  const now = getServerTime().toISOString();
  const ok = await updateIncidentRow(spreadsheetId, tabMonth, incidentId, {
    shift_instance_id: shiftInstanceId,
    outside_shift: false,
    link_source: 'admin',
    linked_by: ctx.user.id,
    linked_at: now,
    updated_at: now,
    version: (Number(incident['version']) || 1) + 1,
  });
  if (!ok) throw new Error('Incident tidak ditemukan');

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'link_incident_shift',
    objectType: 'incident',
    objectId: incidentId,
    branchId,
    shiftInstanceId,
    before: { shiftInstanceId: asStr(incident['shift_instance_id']), outsideShift: asBool(incident['outside_shift']) },
    after: { shiftInstanceId, outsideShift: false },
  });

  return { success: true };
}

export async function unlinkIncidentFromShift(
  ctx: AuthContext,
  incidentId: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ success: boolean }> {
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) throw new Error('Incident tidak ditemukan');
  const { spreadsheetId, branchId, incident, tabMonth } = located;

  const previousShiftId = asStr(incident['shift_instance_id']);
  if (!previousShiftId) return { success: true };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const now = getServerTime().toISOString();
  const ok = await updateIncidentRow(spreadsheetId, tabMonth, incidentId, {
    shift_instance_id: '',
    outside_shift: true,
    link_source: 'admin_unlink',
    linked_by: ctx.user.id,
    linked_at: getServerTime().toISOString(),
    updated_at: getServerTime().toISOString(),
    version: (Number(incident['version']) || 1) + 1,
  });
  if (!ok) throw new Error('Incident tidak ditemukan');

  await appendAuditLogFor(spreadsheetId, {
    actorId: ctx.user.id,
    action: 'unlink_incident_shift',
    objectType: 'incident',
    objectId: incidentId,
    branchId,
    shiftInstanceId: previousShiftId,
    before: { shiftInstanceId: previousShiftId, outsideShift: false },
    after: { shiftInstanceId: '', outsideShift: true },
  });

  return { success: true };
}

export async function addIncidentNote(
  ctx: AuthContext,
  incidentId: string,
  note: string
): Promise<{ success: boolean; noteId: string }> {
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) throw new Error('Incident tidak ditemukan');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { spreadsheetId, tabMonth } = located;

  const noteId = `NOTE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = getServerTime().toISOString();

  await insertRow(spreadsheetId, 'IncidentNotes', {
    id: noteId,
    incident_id: incidentId,
    author_id: ctx.user.id,
    author_role: 'admin',
    note,
    created_at: now,
  });

  return { success: true, noteId };
}

export async function getIncidentCategories(ctx: AuthContext): Promise<IncidentCategory[]> {
  const categories = await categoryNameMap(ctx);
  return Array.from(categories.entries()).map(([id, name]) => ({ id, name }));
}