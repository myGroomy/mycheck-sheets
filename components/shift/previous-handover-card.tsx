'use client';

// components/shift/previous-handover-card.tsx
// Kartu "Handover dari shift sebelumnya" untuk halaman shift petugas.
//
// PRD 6.3.1: shift berikutnya di cabang yang sama melihat handover shift
// sebelumnya dan menandai "Sudah dibaca" (tercatat siapa dan kapan).
//
// Data diambil dari `GET /api/shifts/[id]/handover-prev`, yang sudah
// me-resolve label field dari snapshot shift sebelumnya. Karena itu kartu ini
// tidak bergantung pada template shift yang sedang berjalan.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ImageIcon,
  MessageSquare,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreviousHandoverField {
  id: string;
  label: string;
  fieldType: string;
  inputTypes: string[];
  display: string;
  hasPhoto: boolean;
}

export interface PreviousHandoverPayload {
  previousShift: {
    shiftInstanceId: string;
    name: string;
    shiftDate: string;
    closedAt: string;
    status: string;
  } | null;
  handover: {
    id: string;
    fields: PreviousHandoverField[];
    freeText: string;
    photoIds: string[];
    submittedByName: string;
    submittedAt: string;
  } | null;
  openIncidents: {
    id: string;
    description: string;
    reportedAt: string;
    severity: string;
    categoryName: string;
  }[];
  ack: { readAt: string | null; readByCount: number; readByMe: boolean };
}

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

export function PreviousHandoverCard({ shiftId }: { shiftId: string }) {
  const [data, setData] = useState<PreviousHandoverPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/shifts/${shiftId}/handover-prev`, {
        headers: { 'X-Requested-With': 'fetch' },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorMessage(json, 'Gagal memuat handover shift sebelumnya.'));
        return;
      }
      setError(null);
      setData(json as PreviousHandoverPayload);
    } catch {
      setError('Gagal memuat handover shift sebelumnya. Periksa koneksi.');
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const markRead = async () => {
    if (!data?.handover) return;
    setAcking(true);
    try {
      const res = await fetch(`/api/handovers/${data.handover.id}/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ shift_instance_id: shiftId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(errorMessage(json, 'Gagal menandai handover sudah dibaca.'));
        return;
      }
      toast.success(
        (json as { status?: string })?.status === 'sudah_dibaca'
          ? 'Handover ini sudah tercatat pernah Anda baca sebelumnya.'
          : 'Handover ditandai sudah dibaca.'
      );
      await load();
    } catch {
      toast.error('Gagal menandai handover sudah dibaca. Periksa koneksi.');
    } finally {
      setAcking(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded bg-canvas" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-canvas" />
        <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-canvas" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
      >
        <h3 className="text-base font-bold text-ink">Handover shift sebelumnya</h3>
        <p className="mt-2 text-sm text-ink-muted">{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if (!data?.previousShift) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-base font-bold text-ink">Handover shift sebelumnya</h3>
        <p className="mt-2 text-sm text-ink-muted">
          Belum ada shift tertutup sebelumnya di cabang ini.
        </p>
      </div>
    );
  }

  const { handover, openIncidents, ack } = data;
  const filledFields = handover?.fields.filter((field) => field.display !== '—') ?? [];
  const photoCount = handover?.fields.filter((field) => field.hasPhoto).length ?? 0;

  return (
    <section
      aria-label="Handover dari shift sebelumnya"
      className="rounded-2xl border border-border bg-surface shadow-sm"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">Handover shift sebelumnya</h3>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {data.previousShift.name} · {formatDate(data.previousShift.shiftDate)}
            {data.previousShift.status === 'ditutup_paksa' ? ' (ditutup paksa)' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Sembunyikan handover' : 'Tampilkan handover'}
          className="-mr-1 shrink-0 rounded-md p-1.5 text-ink-muted transition hover:bg-canvas hover:text-ink"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </header>

      {!expanded ? (
        <div className="px-4 py-3">
          {ack.readByMe ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Sudah Anda baca {ack.readAt ? formatDateTime(ack.readAt) : ''}
            </p>
          ) : (
            <p className="text-xs text-ink-muted">
              {filledFields.length} isian · {openIncidents.length} incident open
            </p>
          )}
        </div>
      ) : !handover ? (
        <div className="p-4">
          <p className="text-sm text-ink-muted">
            Shift sebelumnya ditutup tanpa mengisi handover, jadi tidak ada catatan serah terima.
          </p>
          {openIncidents.length > 0 && <OpenIncidentList incidents={openIncidents} />}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {/* Field terstruktur */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Isian serah terima
            </h4>
            {filledFields.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Tidak ada isian handover.</p>
            ) : (
              <dl className="mt-2 space-y-2">
                {filledFields.map((field) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-border bg-canvas px-3 py-2"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {field.label}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
                      {field.display}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {photoCount > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {photoCount} isian lihat foto · buka laporan shift untuk melihat gambarnya
              </p>
            )}
          </div>

          {/* Catatan bebas */}
          {handover.freeText && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Catatan
              </h4>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-canvas p-3 text-sm text-ink">
                {handover.freeText}
              </p>
            </div>
          )}

          {/* Incident open */}
          <OpenIncidentList incidents={openIncidents} />

          {/* Pengirim + tanda sudah dibaca */}
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
                    Sudah dibaca {ack.readByCount} orang di shift ini.
                  </p>
                )}
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full"
                disabled={acking}
                onClick={() => void markRead()}
              >
                <CheckCircle2 className="h-4 w-4" />
                {acking ? 'Menyimpan...' : 'Sudah dibaca'}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function OpenIncidentList({
  incidents,
}: {
  incidents: { id: string; description: string; reportedAt: string; categoryName: string }[];
}) {
  if (incidents.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Incident masih open ({incidents.length})
      </p>
      <ul className="mt-2 space-y-2">
        {incidents.map((incident) => (
          <li key={incident.id} className="text-xs text-amber-900">
            <p className="font-medium">{incident.categoryName}</p>
            <p className="mt-0.5">{incident.description}</p>
            {incident.reportedAt && (
              <p className="mt-0.5 text-amber-700">{formatDateTime(incident.reportedAt)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}