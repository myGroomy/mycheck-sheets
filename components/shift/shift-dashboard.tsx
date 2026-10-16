'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FolderKanban, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonTransition } from '@/components/ui/skeleton-transition';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCabang, type ShiftSummary } from '@/lib/CabangContext';

function formatHHmm(value: string | null | undefined) {
  if (!value) return '-';
  return value.slice(0, 5);
}

/**
 * Placeholder kartu per cabang saat daftar shift dimuat. Meniru kartu cabang
 * di bawah (kode + nama + baris shift) supaya tidak ada layout shift.
 */
function SkeletonBranchList({ count = 3 }: { count?: number }) {
  return (
    <SkeletonTransition>
      <div className="space-y-4" role="status" aria-label="Memuat daftar shift">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
            </div>
            <div className="space-y-2.5">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonTransition>
  );
}

export function ShiftDashboardClient({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const { branches, shifts, loading, error, refreshBranches, refreshBranchesIfStale } = useCabang();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shiftToOpen, setShiftToOpen] = useState<ShiftSummary | null>(null);

  const groupedByBranch = useMemo(() => {
    const map = new Map<string, ShiftSummary[]>();
    for (const item of shifts) {
      const bucket = map.get(item.branchId) ?? [];
      bucket.push(item);
      map.set(item.branchId, bucket);
    }
    return map;
  }, [shifts]);

  useEffect(() => {
    if (!loading && !error) void refreshBranchesIfStale();
  }, [loading, error, refreshBranchesIfStale]);

  const performAction = async (
    action: 'open' | 'join',
    shiftDefinitionId: string,
    instanceId?: string,
    branchId?: string
  ) => {
    setBusy(shiftDefinitionId);
    setNotice(null);
    try {
      const endpoint = action === 'open' ? '/api/shifts/open' : `/api/shifts/${instanceId}/join`;
      // branchId wajib untuk admin: tanpa itu server tidak bisa tahu cabang
      // kerja yang dimaksud dan menolak dengan 400.
      const body = action === 'open' ? { shiftDefinitionId, branchId } : undefined;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as {
        error?: string;
        status?: string;
        shift_instance_id?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Operasi shift gagal');
      }
      const nextId = data.shift_instance_id ?? instanceId;
      if (nextId) {
        setShiftToOpen(null);
        void refreshBranches();
        router.push(`/shift/${nextId}`);
        return;
      }
      setNotice('Aksi shift berhasil diproses.');
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Operasi shift gagal.');
    } finally {
      setBusy(null);
    }
  };

  const renderShiftAction = (item: ShiftSummary) => {
    const instance = item.instance;
    if (!instance) {
      return (
        <Button
          type="button"
          className="w-full justify-center"
          onClick={() => {
            setNotice(null);
            setShiftToOpen(item);
          }}
          disabled={busy === item.id}
        >
          {busy === item.id ? 'Memproses...' : 'Buka Shift'}
        </Button>
      );
    }

    if (instance.status === 'berjalan') {
      const isPj = instance.pj_user_id === userId;
      return (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" asChild>
            <Link href={`/shift/${instance.shift_instance_id}`}>{isPj ? 'Lanjutkan' : 'Check-in'}</Link>
          </Button>
          {!isPj && (
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => void performAction('join', item.id, instance.shift_instance_id)}
              disabled={busy === item.id}
            >
              {busy === item.id ? 'Bergabung...' : 'Gabung'}
            </Button>
          )}
        </div>
      );
    }

    return (
      <Button type="button" variant="secondary" className="w-full justify-center" asChild>
        <Link href={`/shift/${instance.shift_instance_id}`}>Lihat status</Link>
      </Button>
    );
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
      
      <header className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-muted sm:text-xs">MyCheck</p>
          <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Halo, {userName}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink-muted">
          <Clock3 className="h-4 w-4" />
          <span>
            {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            {' • '}
            {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      {(notice || error) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice || error}</span>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Cabang akses</p>
          <p className="mt-2 text-2xl font-bold text-ink">{branches.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Shift berjalan</p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {shifts.filter((item) => item.instance && item.instance.status === 'berjalan').length}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl border border-border bg-surface p-4 text-center md:col-span-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Status</p>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Online
          </p>
        </div>
      </section>

      <section id="daftar-shift" className="space-y-4">
        {loading ? (
          <SkeletonBranchList count={3} />
        ) : branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-ink-muted">
            Tidak ada cabang yang bisa diakses.
          </div>
        ) : (
          branches.map((branch) => {
            const items = groupedByBranch.get(branch.id) ?? [];
            return (
              <div key={branch.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-2xs uppercase tracking-wide text-ink-muted sm:text-xs">{branch.code}</p>
                    <h2 className="mt-1 truncate text-base font-bold text-ink sm:text-lg">{branch.name}</h2>
                  </div>
                  <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-canvas px-2.5 py-1 text-2xs text-ink-muted sm:text-xs">
                    <FolderKanban className="h-3.5 w-3.5" />
                    {branch.timezone}
                  </div>
                </div>

                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-canvas p-4 text-sm text-ink-muted">
                      Tidak ada template shift aktif untuk cabang ini.
                    </div>
                  ) : (
                    items.map((item) => {
                      const instance = item.instance;
                      const statusText = !instance
                        ? 'Belum dibuka'
                        : instance.status === 'berjalan'
                          ? 'Berjalan'
                          : instance.status === 'ditutup'
                            ? 'Ditutup'
                            : 'Status lain';
                      return (
                        <div key={item.id} className="rounded-xl border border-border bg-canvas p-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <h3 className="min-w-0 truncate font-semibold text-ink">{item.name}</h3>
                                <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-2xs font-semibold uppercase text-ink-muted">
                                  {statusText}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatHHmm(item.startTime)} - {formatHHmm(item.endTime)}</span>
                                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{instance ? 'Aktif' : 'Siap dibuka'}</span>
                              </div>
                            </div>
                            <div className="flex w-full min-w-0 items-center justify-end sm:w-auto sm:min-w-[180px]">
                              {renderShiftAction(item)}
                            </div>
                          </div>
                          {instance && instance.status === 'berjalan' && (
                            <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Shift dibuka pada {item.today}
                              </span>
                              <Link href={`/shift/${instance.shift_instance_id}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                Lanjutkan <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      <Dialog open={shiftToOpen !== null} onOpenChange={(open) => !open && setShiftToOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi buka shift</DialogTitle>
            <DialogDescription>
              Periksa cabang dan jadwal sebelum memulai. Petugas yang membuka shift akan menjadi PJ dan bertanggung jawab atas penutupannya.
            </DialogDescription>
          </DialogHeader>
          {shiftToOpen && (
            <div className="space-y-2 rounded-lg border border-border bg-canvas p-3 text-sm">
              <p><span className="font-medium">Cabang:</span> {branches.find((branch) => branch.id === shiftToOpen.branchId)?.name ?? shiftToOpen.branchId}</p>
              <p><span className="font-medium">Shift:</span> {shiftToOpen.name}</p>
              <p><span className="font-medium">Tanggal:</span> {shiftToOpen.today}</p>
              <p><span className="font-medium">Waktu:</span> {formatHHmm(shiftToOpen.startTime)}–{formatHHmm(shiftToOpen.endTime)}</p>
              <p><span className="font-medium">PJ:</span> {userName} (Anda)</p>
            </div>
          )}
          {notice && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {notice}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShiftToOpen(null)} disabled={Boolean(busy)}>
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => shiftToOpen && void performAction('open', shiftToOpen.id, undefined, shiftToOpen.branchId)}
              disabled={!shiftToOpen || busy === shiftToOpen.id}
            >
              {shiftToOpen && busy === shiftToOpen.id ? 'Membuka shift...' : 'Konfirmasi & buka'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
