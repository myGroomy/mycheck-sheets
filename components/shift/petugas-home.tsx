'use client';

// components/shift/petugas-home.tsx — Beranda untuk petugas (Opsi 4).
// Sapaan -> ringkasan shift hari ini -> incident/item belum selesai ->
// notifikasi -> jalan pintas -> profil singkat.
//
// Semua angka berasal dari API yang sudah ada (api/shifts, api/incidents,
// api/shifts/[id]/progress, api/notifications). Tidak ada endpoint baru dan
// tidak ada perubahan skema.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  ListTodo,
  MapPin,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PetugasNav } from '@/components/shift/petugas-nav';

interface ShiftDefSummary {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  instance: { shift_instance_id: string; status: string; pj_user_id: string | null } | null;
}

interface ShiftsResponse {
  branches: { id: string; name: string; code: string; timezone: string }[];
  shifts: ShiftDefSummary[];
  server_time: string;
}

interface IncidentRow {
  id: string;
  status: string;
  outsideShift: boolean;
  description: string;
}

interface NotificationRow {
  id: string;
  type: string;
  payload: { title: string; body: string; link: string | null };
  created_at: string;
  read_at: string | null;
}

interface ProgressResponse {
  progress: { total: number; selesai: number; skip: number; belum: number };
}

const HEADER = { 'X-Requested-With': 'fetch' } as const;

// Tanggal dalam zona waktu perangkat hanya untuk tampilan; nilai yang dipakai
// selalu server_time (BR-23).
function formatTanggal(iso: string | null) {
  if (!iso) return 'Memuat tanggal...';
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof ListTodo;
  tone?: 'default' | 'warning' | 'ok';
}) {
  const toneClass =
    tone === 'warning' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-700' : 'text-ink';
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-light">{hint}</p>}
    </div>
  );
}

export function PetugasHome({
  userId,
  userName,
  username,
  role,
}: {
  userId: string;
  userName: string;
  username: string;
  role: string;
}) {
  const [branches, setBranches] = useState<{ id: string; name: string; timezone: string }[]>([]);
  const [shifts, setShifts] = useState<ShiftDefSummary[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [belumSelesai, setBelumSelesai] = useState<number | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftRes, incidentRes, notifRes] = await Promise.all([
        fetch('/api/shifts', { headers: HEADER }),
        fetch('/api/incidents', { headers: HEADER }),
        fetch('/api/notifications', { headers: HEADER }),
      ]);

      if (!shiftRes.ok) throw new Error('Gagal memuat data shift');

      const shiftData = (await shiftRes.json()) as Partial<ShiftsResponse>;
      setBranches(shiftData.branches ?? []);
      setShifts(shiftData.shifts ?? []);
      // BR-23: penentuan waktu memakai jam server, bukan jam HP. Tanggal di
      // header diambil dari server_time, bukan `new Date()` di perangkat.
      setServerTime(shiftData.server_time ?? null);
      // Semua parsing respons dibuat tahan bentuk tak terduga: kalau kunci hilang,
      // hasilnya array kosong — bukan `undefined` yang membuat halaman crash.
      setIncidents(
        incidentRes.ok
          ? (((await incidentRes.json()) as { incidents?: IncidentRow[] }).incidents ?? [])
          : []
      );
      // /api/notifications mengembalikan { items }, bukan { notifications }.
      setNotifications(
        notifRes.ok
          ? (((await notifRes.json()) as { items?: NotificationRow[] }).items ?? [])
          : []
      );

      // Jumlah item belum selesai: satu panggilan progress per shift yang sedang
      // berjalan. Shift berjalan biasanya 1-3, jadi ini tetap murah.
      const running = (shiftData.shifts ?? []).filter((s) => s.instance?.status === 'berjalan');
      if (running.length === 0) {
        setBelumSelesai(0);
      } else {
        const counts = await Promise.all(
          running.map(async (s) => {
            try {
              const res = await fetch(`/api/shifts/${s.instance!.shift_instance_id}/progress`, {
                headers: HEADER,
              });
              if (!res.ok) return 0;
              const data = (await res.json()) as Partial<ProgressResponse>;
              // Guard: kalau bentuk respons berubah, jangan sampai membuat
              // halaman crash — tandai saja 0.
              return Number(data?.progress?.belum ?? 0) || 0;
            } catch {
              return 0;
            }
          })
        );
        setBelumSelesai(counts.reduce((sum, n) => sum + n, 0));
      }
    } catch {
      setNotice('Tidak dapat memuat data saat ini. Coba lagi sebentar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const berjalan = shifts.filter((s) => s.instance?.status === 'berjalan');
  const ditutup = shifts.filter((s) => s.instance?.status === 'ditutup');
  const belumDibuka = shifts.filter((s) => !s.instance);
  const incidentOpen = incidents.filter((i) => i.status === 'open');
  const unread = notifications.filter((n) => !n.read_at);

  const shortcuts = [
    { href: '/daftar-shift', label: 'Checklist', icon: ClipboardCheck },
    { href: '/incident', label: 'Incident', icon: AlertTriangle },
    { href: '/report', label: 'Laporan', icon: FileText },
    { href: '/docs', label: 'Panduan', icon: BookOpen },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
      <PetugasNav />

      {/* Sapaan */}
      <header className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Checklist-shift
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Halo, {userName}</h1>
        <p className="mt-1 text-sm text-ink-muted">{formatTanggal(serverTime)}</p>
      </header>

      {notice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

      {/* Ringkasan shift hari ini */}
      <section aria-label="Ringkasan shift hari ini" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total shift" value={shifts.length} icon={ClipboardCheck} />
        <StatCard
          label="Sedang berjalan"
          value={berjalan.length}
          icon={CheckCircle2}
          tone={berjalan.length > 0 ? 'ok' : 'default'}
        />
        <StatCard label="Belum dibuka" value={belumDibuka.length} icon={Clock3} />
        <StatCard label="Sudah ditutup" value={ditutup.length} icon={CheckCircle2} />
      </section>

      {/* Incident + item belum selesai */}
      <section aria-label="Yang perlu diperhatikan" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Incident open
            </div>
            {incidentOpen.length > 0 && <Badge variant="outline">{incidentOpen.length}</Badge>}
          </div>
          <p className={`mt-2 text-2xl font-bold ${incidentOpen.length > 0 ? 'text-amber-700' : 'text-ink'}`}>
            {incidentOpen.length}
          </p>
          <Link
            href="/incident"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline"
          >
            Lihat incident
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
            <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
            Item belum selesai
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">
            {loading ? '...' : (belumSelesai ?? 0)}
          </p>
          <Link
            href="/daftar-shift"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline"
          >
            Buka checklist
          </Link>
        </div>
      </section>

      {/* Shift yang sedang berjalan */}
      {berjalan.length > 0 && (
        <section aria-label="Shift sedang berjalan" className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
            Shift sedang berjalan
          </h2>
          {berjalan.map((s) => {
            const branch = branches.find((b) => b.id === s.branchId);
            const isPj = s.instance?.pj_user_id === userId;
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-emerald-900">{s.name}</p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    {branch?.name ?? s.branchId} · {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                    {isPj ? ' · Anda PJ' : ''}
                  </p>
                </div>
                <Button asChild variant="outline" className="bg-white">
                  <Link href={`/shift/${s.instance!.shift_instance_id}`}>
                    {isPj ? 'Lanjutkan' : 'Check-in'}
                  </Link>
                </Button>
              </div>
            );
          })}
        </section>
      )}

      {/* Notifikasi */}
      <section aria-label="Notifikasi" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Notifikasi</h2>
          {unread.length > 0 && <Badge variant="outline">{unread.length} baru</Badge>}
        </div>
        {notifications.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-ink-muted">
            Belum ada notifikasi.
          </p>
        ) : (
          <ul className="space-y-2">
            {notifications.slice(0, 3).map((n) => {
              const body = (
                <>
                  <span className="text-sm font-medium text-ink">{n.payload.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {n.payload.body}
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.payload.link ? (
                    <Link
                      href={n.payload.link}
                      className="block rounded-2xl border border-border bg-surface p-3 transition hover:bg-canvas"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="rounded-2xl border border-border bg-surface p-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Jalan pintas */}
      <section aria-label="Jalan pintas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-canvas"
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </section>

      {/* Profil singkat */}
      <section aria-label="Profil" className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Akun saya</p>
            <p className="mt-1 font-semibold text-ink">{userName}</p>
            <p className="text-xs text-ink-muted">
              {username} · {role === 'admin' ? 'Admin' : 'Petugas'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {branches.map((b) => (
                <Badge key={b.id} variant="secondary">
                  <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
                  {b.name}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/ganti-pin">Ganti PIN</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}