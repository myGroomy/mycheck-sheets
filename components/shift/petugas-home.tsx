'use client';

// components/shift/petugas-home.tsx Beranda untuk petugas (Opsi 4).
// Sapaan -> ringkasan shift hari ini -> incident/item belum selesai ->
// notifikasi -> jalan pintas -> profil singkat.
//
// Sekarang memakai /api/beranda (satu panggilan) menggantikan 4 panggilan
// terpisah ke /api/shifts, /api/incidents, /api/notifications,
// dan /api/shifts/[id]/progress.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ListTodo,
  MapPin,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SkeletonHeader,
  SkeletonStatGrid,
  SkeletonList,
} from '@/components/ui/skeletons';
import { PetugasNav } from '@/components/shift/petugas-nav';

interface DashboardSummary {
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

const HEADER = { 'X-Requested-With': 'fetch' } as const;

function formatTanggal(iso: string | null) {
  if (!iso) return 'Memuat tanggal...';
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

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
    <div className="rounded-2xl border border-border bg-surface px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
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
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/beranda', { headers: HEADER });
      if (!res.ok) throw new Error('Gagal memuat data beranda');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Gagal memuat data');
      setData(json.data);
    } catch {
      setNotice('Tidak dapat memuat data saat ini. Coba lagi sebentar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
        <PetugasNav />
        <SkeletonHeader />
        <SkeletonStatGrid count={4} />
        <SkeletonList count={4} />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
        <PetugasNav />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-amber-800">
          Gagal memuat data beranda. Silakan coba lagi.
        </div>
      </main>
    );
  }

  const {
    shift,
    incident,
    items,
    notifications,
    shiftBerjalan,
    serverTime,
  } = data;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const ditutup = shift.ditutup;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const belumDibuka = shift.belumDibuka;
  const berjalan = shift.berjalan;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const incidentOpen = incident.open;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const unread = notifications.unread;

  const shortcuts = [
    { href: '/daftar-shift', label: 'Checklist', icon: ClipboardCheck },
    { href: '/incident', label: 'Incident', icon: AlertTriangle },
    { href: '/report', label: 'Laporan', icon: FileText },
    { href: '/docs', label: 'Panduan', icon: BookOpen },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
      <PetugasNav />

      {/* Sapaan */}
      <header className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
          MyCheck
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
        <StatCard label="Total shift" value={shift.total} icon={ClipboardCheck} />
        <StatCard
          label="Sedang berjalan"
          value={shift.berjalan}
          icon={CheckCircle2}
          tone={berjalan > 0 ? 'ok' : 'default'}
        />
        <StatCard label="Belum dibuka" value={shift.belumDibuka} icon={ClipboardCheck} />
        <StatCard label="Sudah ditutup" value={shift.ditutup} icon={CheckCircle2} />
      </section>

      {/* Incident + item belum selesai */}
      <section aria-label="Yang perlu diperhatikan" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Incident open
            </div>
            {incident.open > 0 && <Badge variant="outline">{incident.open}</Badge>}
          </div>
          <p className={`mt-2 text-2xl font-bold ${incident.open > 0 ? 'text-amber-700' : 'text-ink'}`}>
            {incident.open}
          </p>
          <Link
            href="/incident"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline"
          >
            Lihat incident
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-surface px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
            <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
            Item belum selesai
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{items.belumSelesai}</p>
          <Link
            href="/daftar-shift"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline"
          >
            Buka checklist
          </Link>
        </div>
      </section>

      {/* Shift yang sedang berjalan */}
      {shiftBerjalan.length > 0 && (
        <section aria-label="Shift sedang berjalan" className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
            Shift sedang berjalan
          </h2>
          {shiftBerjalan.map((s) => {
            const isPj = s.instance?.pjUserId === userId;
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-emerald-900">{s.shiftName}</p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    {s.branchName} · {s.startTime}–{s.endTime}
                    {isPj ? ' · Anda PJ' : ''}
                  </p>
                </div>
                <Link
                  href={`/shift/${s.instance?.shiftInstanceId}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-emerald-700 border border-emerald-200 transition hover:bg-emerald-50"
                >
                  {isPj ? 'Lanjutkan' : 'Check-in'}
                </Link>
              </div>
            );
          })}
        </section>
      )}

      {/* Notifikasi */}
      <section aria-label="Notifikasi" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Notifikasi</h2>
          {notifications.unread > 0 && <Badge variant="outline">{notifications.unread} baru</Badge>}
        </div>
        {notifications.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-sm text-ink-muted">
            Belum ada notifikasi.
          </p>
        ) : (
          <ul className="space-y-2">
            {notifications.items.slice(0, 3).map((n) => {
              const body = (
                <>
                  <span className="text-sm font-medium text-ink">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {n.body}
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
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
      <section aria-label="Profil" className="rounded-2xl border border-border bg-surface px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Akun saya</p>
            <p className="mt-1 font-semibold text-ink">{userName}</p>
            <p className="text-xs text-ink-muted">
              {username} · {role === 'admin' ? 'Admin' : 'Petugas'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {shiftBerjalan.map((b) => (
                <Badge key={b.id} variant="secondary">
                  <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
                  {b.branchName}
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
