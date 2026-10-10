// lib/domain/dashboard-service.ts
// Domain service untuk data Beranda menggabungkan 4 endpoint API jadi 1 panggilan.

import type { AuthContext } from '../api-auth';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { filterRows, listMonthlyRows } from '../store';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { resolveCabang } from '../google/registry';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getCabangList } from '../google/registry-admin';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { asBool, asStr } from '../store';

export interface DashboardSummary {
  shift: {
    total: number;
    berjalan: number;
    belumDibuka: number;
    ditutup: number;
  };
  incident: {
    open: number;
    total: number;
  };
  items: {
    belumSelesai: number;
  };
  notifications: {
    total: number;
    unread: number;
    items: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      link: string | null;
      createdAt: string;
      readAt: string | null;
    }>;
  };
  shiftBerjalan: Array<{
    id: string;
    shiftDefinitionId: string;
    shiftName: string;
    branchId: string;
    branchName: string;
    startTime: string;
    endTime: string;
    instance: {
      shiftInstanceId: string;
      status: string;
      pjUserId: string | null;
    } | null;
    branchTimezone: string;
  }>;
  serverTime: string;
}

export async function getDashboardSummary(/* eslint-disable @typescript-eslint/no-unused-vars */ ctx: AuthContext): Promise<DashboardSummary> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const now = new Date().toISOString();

  // 1. Fetch shifts data (parallel)
  const [shiftRes, incidentRes, notifRes] = await Promise.all([
    fetch('/api/shifts', { headers: { 'X-Requested-With': 'fetch' } }),
    fetch('/api/incidents', { headers: { 'X-Requested-With': 'fetch' } }),
    fetch('/api/notifications', { headers: { 'X-Requested-With': 'fetch' } }),
  ]);

  if (!shiftRes.ok) throw new Error('Gagal memuat data shift');
  const shiftData = await shiftRes.json() as { branches: unknown[]; shifts: unknown[]; server_time: string };
  const incidentData = await incidentRes.json() as { incidents: unknown[] };
  const notifData = await notifRes.json() as { notifications: unknown[] };

  // Branch summary
  const berjalan = shiftData.shifts.filter((item: unknown) => { const inst = (item as Record<string, unknown>).instance; return inst && typeof inst === 'object' && 'status' in inst && inst.status === 'berjalan'; }) as Array<Record<string, unknown> & { instance: { shift_instance_id: string; status: string } }>;
  const ditutup = shiftData.shifts.filter((item: unknown) => { const inst = (item as Record<string, unknown>).instance; return inst && typeof inst === 'object' && 'status' in inst && inst.status === 'ditutup'; }) as Array<Record<string, unknown> & { instance: { shift_instance_id: string; status: string } }>;
  const belumDibuka = shiftData.shifts.filter((item: unknown) => { const inst = (item as Record<string, unknown>).instance; return !inst; });

  // Incident open
  const incidentOpen = incidentData.incidents?.filter((i: unknown) => (i as Record<string, unknown>).status === 'open') || [];

  // Items belum selesai - aggregate from progress of running shifts
  let belumSelesai = 0;
  for (const s of berjalan) {
    if (s.instance?.shift_instance_id) {
      try {
        const res = await fetch(`/api/shifts/${s.instance.shift_instance_id}/progress`, {
          headers: { 'X-Requested-With': 'fetch' },
        });
        if (res.ok) {
          const data = await res.json() as { progress: { belum: number } };
          belumSelesai += data.progress?.belum || 0;
        }
      } catch { /* ignore */ }
    }
  }

  // Notifications
  const notifications = notifData.notifications || [];
  const unread = notifications.filter((n: unknown) => !(n as Record<string, unknown>).read_at);

  // Shift berjalan detail for UI
  const shiftBerjalan = berjalan.map((s: Record<string, unknown> & { instance: { shift_instance_id: string; status: string; pj_user_id?: string } | null }) => {
    const instance = s.instance;
    return {
      id: String(s.id),
      shiftDefinitionId: String(s.shift_definition_id),
      shiftName: String(s.shift_name || s.name),
      branchId: String(s.branch_id),
      branchName: String(s.branch_name),
      startTime: String(s.start_time || s.startTime),
      endTime: String(s.end_time || s.endTime),
      instance: instance ? {
        shiftInstanceId: String(instance.shift_instance_id),
        status: String(instance.status),
        pjUserId: instance.pj_user_id ? String(instance.pj_user_id) : null,
      } : null,
      branchTimezone: String(s.timezone),
    };
  });

  return {
    shift: {
      total: shiftData.shifts.length,
      berjalan: berjalan.length,
      belumDibuka: belumDibuka.length,
      ditutup: ditutup.length,
    },
    incident: {
      open: incidentOpen.length,
      total: incidentData.incidents?.length || 0,
    },
    items: {
      belumSelesai,
    },
    notifications: {
      total: notifications.length,
      unread: unread.length,
      items: notifications.slice(0, 3).map((n: unknown) => {
        const payload = (n as Record<string, unknown>).payload as Record<string, unknown> | undefined;
        return {
          id: String((n as Record<string, unknown>).id),
          type: String((n as Record<string, unknown>).type),
          title: String(payload?.title || ''),
          body: String(payload?.body || ''),
          link: payload?.link ? String(payload.link) : null,
          createdAt: String((n as Record<string, unknown>).created_at),
          readAt: (n as Record<string, unknown>).read_at ? String((n as Record<string, unknown>).read_at) : null,
        };
      }),
    },
    shiftBerjalan,
    serverTime: shiftData.server_time || new Date().toISOString(),
  };
}