'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, FileText, Link2, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SkeletonTransition } from '@/components/ui/skeleton-transition';
import { PageLoader } from '@/components/ui/QuantumLoader';
import { apiFetch } from '@/lib/admin/api';

interface ReportRow {
  id: string;
  reportNumber: string;
  generatedAt: string;
  isLocked: boolean;
  archivePdfDriveUrl: string | null;
  branchId: string;
  branchName: string;
  branchCode: string;
  shiftName: string;
  shiftDate: string;
  shiftStatus: string;
  pjName: string | null;
  tokens?: ShareToken[];
}

interface BranchRow {
  id: string;
  name: string;
  code: string;
}

interface ShareToken {
  id: string;
  expires_at: string;
  expired: boolean;
}

const ITEMS_PER_PAGE = 10;

export interface ReportListProps {
  role?: 'admin' | 'petugas';
}

export function ReportList({ role = 'petugas' }: ReportListProps) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState('');
  const [pjName, setPjName] = useState('');
  const [draftBranchId, setDraftBranchId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftPjName, setDraftPjName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newShareLinks, setNewShareLinks] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (role === 'admin') {
        const params = new URLSearchParams();
        if (branchId) params.set('branchId', branchId);
        if (date) {
          const start = new Date(`${date}T00:00:00Z`);
          const end = new Date(`${date}T23:59:59Z`);
          params.set('days', '1');
          params.set('dateFrom', start.toISOString());
          params.set('dateTo', end.toISOString());
        }
        if (pjName.trim()) params.set('pjName', pjName.trim());
        const query = params.size ? `?${params.toString()}` : '';
        const [reportResult, branchResult] = await Promise.all([
          apiFetch<{ reports: ReportRow[] }>(`/api/admin/reports${query}`),
          apiFetch<{ branches: BranchRow[] }>('/api/admin/branches'),
        ]);
        setReports(reportResult.reports);
        setBranches(branchResult.branches);
        setCurrentPage(1);
      } else {
        const response = await fetch('/api/reports', {
          headers: { 'X-Requested-With': 'fetch' },
        });
        const result = (await response.json()) as { error?: string; reports?: ReportRow[] };
        if (!response.ok) throw new Error(result.error || 'Gagal memuat laporan.');
        setReports(result.reports ?? []);
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Gagal memuat laporan.';
      setError(msg);
      if (role === 'admin') toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [role, branchId, date, pjName]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const totalPages = Math.ceil(reports.length / ITEMS_PER_PAGE);
  const paginatedReports = reports.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const createShare = async (report: ReportRow) => {
    setBusyId(report.id);
    try {
      const result = await apiFetch<{ token: string; expires_at: string }>(
        `/api/admin/reports/${report.id}/share`,
        { method: 'POST', json: { expiresHours: 720 } }
      );
      const url = `${window.location.origin}/r/${result.token}`;
      setNewShareLinks((current) => ({ ...current, [report.id]: url }));
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Tautan laporan dibuat dan disalin. Berlaku 30 hari.');
      } catch {
        toast.success('Tautan dibuat. Gunakan tombol salin tautan di bawah.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membuat tautan laporan.');
    } finally {
      setBusyId(null);
    }
  };

  if (role === 'admin') {
    return (
      <div className="space-y-4">
        {/* Filter */}
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filter laporan
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            {filtersOpen ? 'Sembunyikan' : 'Tampilkan'}
          </Button>
        </div>
        <div className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 sm:grid sm:grid-cols-4`}>
          <div className="space-y-1">
            <Label htmlFor="filter-branch">Cabang</Label>
            <select
              id="filter-branch"
              value={draftBranchId}
              onChange={(e) => setDraftBranchId(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="">Semua cabang</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="filter-date">Tanggal shift</Label>
            <Input
              id="filter-date"
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="filter-pj">Nama PJ</Label>
            <Input
              id="filter-pj"
              type="text"
              placeholder="Cari Penanggung Jawab"
              value={draftPjName}
              onChange={(e) => setDraftPjName(e.target.value)}
            />
          </div>

          <div className="flex items-end gap-2">
            <Button
              onClick={() => {
                setBranchId(draftBranchId);
                setDate(draftDate);
                setPjName(draftPjName);
              }}
              className="w-full"
            >
              Terapkan filter
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBranchId('');
                setDate('');
                setPjName('');
                setDraftBranchId('');
                setDraftDate('');
                setDraftPjName('');
              }}
              className="w-full"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-ink-muted" />
            <h2 className="mt-3 font-semibold">Tidak ada laporan</h2>
            <p className="mt-1 text-sm text-ink-muted">Sesuaikan filter atau tunggu shift ditutup.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedReports.map((report) => (
              <div
                key={report.id}
                className="rounded-xl border border-border bg-surface p-4 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-muted">
                        {report.reportNumber}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          report.shiftStatus === 'ditutup_paksa'
                            ? 'bg-amber-50 text-amber-900 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        }`}
                      >
                        {report.shiftStatus === 'ditutup_paksa' ? 'Ditutup Paksa' : 'Ditutup Selesai'}
                      </span>
                    </div>
                    <h2 className="font-semibold">
                      {report.branchName} ({report.branchCode}) — {report.shiftName}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      Tanggal Shift: {report.shiftDate} · PJ: {report.pjName ?? '—'} · Dibuat:{' '}
                      {report.generatedAt.replace('T', ' ').slice(0, 16)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/report/${report.id}`}>Buka</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === report.id}
                      onClick={() => createShare(report)}
                    >
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      Buat Tautan Berbagi
                    </Button>
                  </div>
                </div>

                {newShareLinks[report.id] && (
                  <div className="mt-3 rounded-lg bg-canvas p-3 text-xs">
                    <p className="font-medium text-ink">Tautan Berbagi Baru (Berlaku 30 Hari):</p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={newShareLinks[report.id]}
                        className="w-full rounded border border-border bg-surface px-2 py-1 font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(newShareLinks[report.id]);
                          toast.success('Disalin ke clipboard');
                        }}
                      >
                        Salin
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-ink-muted">
                  Halaman {currentPage} dari {totalPages} ({reports.length} total)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Petugas view
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Riwayat</p>
          <h1 className="mt-1 text-2xl font-bold">Laporan shift</h1>
          <p className="mt-1 text-sm text-ink-muted">Laporan dari cabang yang dapat Anda akses.</p>
        </div>
        <Button type="button" variant="outline" onClick={loadReports} disabled={loading} aria-label="Muat ulang laporan">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {loading ? (
        <SkeletonTransition>
          <PageLoader text="Memuat laporan…" />
        </SkeletonTransition>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-ink-muted" />
          <h2 className="mt-3 font-semibold">Belum ada laporan shift</h2>
          <p className="mt-1 text-sm text-ink-muted">Laporan akan tersedia setelah Penanggung Jawab menutup shift.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link key={report.id} href={`/report/${report.id}`} className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">{report.branchCode} · {report.reportNumber}</p>
                  <h2 className="mt-1 truncate font-semibold">{report.branchName} · {report.shiftName}</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {new Date(`${report.shiftDate}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'long' })}
                    {' · PJ '}{report.pjName ?? '—'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${report.shiftStatus === 'ditutup_paksa' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                  {report.shiftStatus === 'ditutup_paksa' ? 'Ditutup paksa' : 'Ditutup'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-ink-muted">
                <span>Dibuat {new Date(report.generatedAt).toLocaleString('id-ID')}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-ink">Lihat laporan <ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
