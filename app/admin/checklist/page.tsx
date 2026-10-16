'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { PageLoader } from '@/components/ui/QuantumLoader';
import { SkeletonTransition } from '@/components/ui/skeleton-transition';
import { apiFetch } from '@/lib/admin/api';

interface ReportItem {
  id: string;
  reportNumber: string;
  generatedAt: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  shiftName: string;
  shiftDate: string;
  shiftStatus: string;
  pjName: string | null;
}

interface BranchRow {
  id: string;
  name: string;
  code: string;
}

export default function AdminChecklistHistoryPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      const query = params.size ? `?${params.toString()}` : '';
      const [reportResult, branchResult] = await Promise.all([
        apiFetch<{ reports: ReportItem[] }>(`/api/admin/reports${query}`),
        apiFetch<{ branches: BranchRow[] }>('/api/admin/branches'),
      ]);
      setReports(reportResult.reports);
      setBranches(branchResult.branches);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memuat riwayat checklist.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="space-y-1 text-sm font-medium flex-1 sm:max-w-xs">
          Cabang
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-canvas px-3 text-base"
          >
            <option value="">Semua cabang</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {loading ? (
        <SkeletonTransition>
          <PageLoader text="Memuat riwayat…" />
        </SkeletonTransition>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-ink-muted" />
          <h2 className="mt-3 font-semibold">Belum ada eksekusi checklist</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Laporan akan muncul setelah shift ditutup. Coba buka shift yang sedang
            berjalan terlebih dahulu, atau perbarui halaman.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/report/${report.id}`}
              className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    {report.branchCode} · {report.reportNumber}
                  </p>
                  <h2 className="mt-1 truncate font-semibold">
                    {report.branchName} · {report.shiftName}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {new Date(`${report.shiftDate}T00:00:00`).toLocaleDateString('id-ID', {
                      dateStyle: 'long',
                    })}
                    {' · PJ '}{report.pjName ?? '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-xs ${
                    report.shiftStatus === 'ditutup_paksa'
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  {report.shiftStatus === 'ditutup_paksa' ? 'Ditutup paksa' : 'Ditutup'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-ink-muted">
                <span>Dibuat {new Date(report.generatedAt).toLocaleString('id-ID')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}