'use client';

// components/handover/handover-history.tsx
// Daftar riwayat handover (serah terima) lintas shift.
//
// Dipakai oleh DUA halaman dengan props berbeda:
//   - /handover        (petugas) — hanya daftar
//   - /admin/handover  (admin)   — daftar + tab builder
//
// Daftar diambil dari `GET /api/handovers` yang berbasis cabang, jadi tidak
// perlu shift yang sedang terbuka. Field tiap handover me-resolve label dari
// snapshot shift pembuatnya (lihat lib/handover-fields.ts), bukan template
// yang aktif sekarang — jadi admin mengubah template tidak akan mengubah
// tampilan handover lama.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  ImageIcon,
  Inbox,
  MessageSquare,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeletons';
import { SkeletonTransition } from '@/components/ui/skeleton-transition';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { HandoverHistoryEntry } from '@/app/api/handovers/route';

interface BranchOption {
  id: string;
  name: string;
}

const ALL_BRANCHES = '__semua__';

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as { error?: unknown; message?: unknown };
    if (typeof record.error === 'string') return record.error;
    if (record.error && typeof record.error === 'object') {
      const nested = (record.error as { message?: unknown }).message;
      if (typeof nested === 'string') return nested;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return fallback;
}

export function HandoverHistory({ showBranchFilter = true }: { showBranchFilter?: boolean }) {
  const [entries, setEntries] = useState<HandoverHistoryEntry[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState(ALL_BRANCHES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (branchId !== ALL_BRANCHES) qs.set('branchId', branchId);
        qs.set('limit', '10');
        const res = await fetch(`/api/handovers?${qs.toString()}`, {
          cache: isRefresh ? 'reload' : 'default',
          headers: { 'X-Requested-With': 'fetch' },
        });
        const json = (await res.json().catch(() => null)) as {
          entries?: HandoverHistoryEntry[];
          branches?: BranchOption[];
          error?: unknown;
        } | null;
        if (!res.ok) {
          setError(errorMessage(json, 'Gagal memuat riwayat handover.'));
          return;
        }
        setEntries(json?.entries ?? []);
        if (json?.branches) setBranches(json.branches);
        // Buka entri terbaru supaya petugas langsung melihat shift sebelumnya.
        setExpandedId((current) => current ?? json?.entries?.[0]?.shiftInstanceId ?? null);
      } catch {
        setError('Gagal memuat riwayat handover. Periksa koneksi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (entry: HandoverHistoryEntry) => {
    if (!entry.handover) return;
    setAckingId(entry.handover.id);
    try {
      const res = await fetch(`/api/handovers/${entry.handover.id}/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        // shift_instance_id sengaja tidak dikirim: endpoint memakai shift
        // pembuat handover sebagai jangkar membaca.
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as { status?: string } | null;
      if (!res.ok) {
        toast.error(errorMessage(json, 'Gagal menandai handover sudah dibaca.'));
        return;
      }
      toast.success(
        json?.status === 'sudah_dibaca'
          ? 'Handover ini sudah tercatat pernah Anda baca sebelumnya.'
          : 'Handover ditandai sudah dibaca.'
      );
      await load(true);
    } catch {
      toast.error('Gagal menandai handover sudah dibaca. Periksa koneksi.');
    } finally {
      setAckingId(null);
    }
  };

  const unreadCount = useMemo(
    () => entries.filter((entry) => entry.handover && !entry.ack.readByMe).length,
    [entries]
  );

  return (
    <section aria-label="Riwayat handover" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Handover</h1>
          <p className="text-xs text-ink-muted">
            Catatan serah terima dari shift yang sudah tutup.
            {unreadCount > 0 && ` ${unreadCount} belum Anda baca.`}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {showBranchFilter && branches.length > 1 && (
            <div className="min-w-[180px] space-y-1">
              <label htmlFor="ho-branch" className="text-xs font-medium text-ink-muted">
                Cabang
              </label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="ho-branch">
                  <SelectValue placeholder="Semua cabang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES}>Semua cabang</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Muat ulang riwayat handover"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="sr-only sm:not-sr-only">Muat ulang</span>
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <SkeletonTransition>
          <SkeletonRows count={4} />
        </SkeletonTransition>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-ink-light" />
          <p className="mt-3 font-semibold">Belum ada riwayat handover</p>
          <p className="mt-1 text-sm text-ink-muted">
            Riwayat muncul setelah ada shift yang ditutup beserta isian serah terima.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <HandoverEntryCard
              key={entry.shiftInstanceId}
              entry={entry}
              expanded={expandedId === entry.shiftInstanceId}
              acking={ackingId === (entry.handover?.id ?? '')}
              showBranchName={showBranchFilter && branches.length > 1}
              onToggle={() =>
                setExpandedId((current) =>
                  current === entry.shiftInstanceId ? null : entry.shiftInstanceId
                )
              }
              onMarkRead={() => void markRead(entry)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HandoverEntryCard({
  entry,
  expanded,
  acking,
  showBranchName,
  onToggle,
  onMarkRead,
}: {
  entry: HandoverHistoryEntry;
  expanded: boolean;
  acking: boolean;
  showBranchName: boolean;
  onToggle: () => void;
  onMarkRead: () => void;
}) {
  const { handover, ack } = entry;
  const filledFields = handover?.fields.filter((field) => field.display !== '—') ?? [];

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold text-ink">{entry.shiftName}</h2>
            {entry.status === 'ditutup_paksa' && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs font-semibold uppercase text-amber-900">
                Ditutup paksa
              </span>
            )}
            {handover && !ack.readByMe && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold uppercase text-primary-foreground">
                Belum dibaca
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {formatDate(entry.shiftDate)}
            {entry.closedAt && ` · tutup ${formatDateTime(entry.closedAt)}`}
            {showBranchName && ` · ${entry.branchName}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!expanded && handover && (
            <span className="text-xs text-ink-muted">
              {entry.filledCount} isian
              {entry.photoCount > 0 && ` · ${entry.photoCount} foto`}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border p-4">
          {!handover ? (
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Shift ini ditutup tanpa mengisi handover, jadi tidak ada catatan serah terima.
            </p>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Isian serah terima
                </h3>
                {filledFields.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">Tidak ada isian handover.</p>
                ) : (
                  <dl className="mt-2 space-y-2">
                    {filledFields.map((field) => (
                      <div key={field.id} className="rounded-lg border border-border bg-canvas px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {field.label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{field.display}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {entry.photoCount > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {entry.photoCount} isian lihat foto — buka laporan shift untuk melihat gambarnya
                  </p>
                )}
              </div>

              {handover.freeText && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    Catatan
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-canvas p-3 text-sm text-ink">
                    {handover.freeText}
                  </p>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {handover.submittedByName || 'Tidak diketahui'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {handover.submittedAt ? formatDateTime(handover.submittedAt) : 'belum dikirim'}
                  </span>
                </p>

                {ack.readByMe ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Sudah Anda baca
                      {ack.readAt ? ` pada ${formatDateTime(ack.readAt)}` : ''}
                    </p>
                    {ack.readByCount > 1 && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Sudah dibaca {ack.readByCount} orang.
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full"
                    disabled={acking}
                    onClick={onMarkRead}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {acking ? 'Menyimpan...' : 'Sudah dibaca'}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
