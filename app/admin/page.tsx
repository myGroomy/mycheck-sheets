import { requireAdmin } from '@/lib/page-auth';
import { buildAdminStats } from '@/lib/admin/stats-service';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function AdminIndex() {
  const ctx = await requireAdmin();
  const { stats, branches: branchStats, alerts } = await buildAdminStats(ctx);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-muted sm:text-xs">
            Admin • {ctx.user.name}
          </p>
          <h1 className="mt-1 truncate text-xl font-bold sm:text-2xl">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard href="/admin/cabang" label="Cabang aktif" value={stats.branches} helper="Kelola cabang" />
        <MetricCard href="/admin/shift" label="Shift berjalan" value={stats.activeShifts} helper="Lihat operasi" />
        <MetricCard href="/admin/incident" label="Incident terbuka" value={stats.openIncidents} helper="Tindak lanjuti" />
        <MetricCard href="/admin/laporan" label="Laporan hari ini" value={stats.reportsToday} helper="Buka laporan" />
      </div>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="setup-guide-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="setup-guide-title" className="flex items-center gap-2 text-base font-semibold">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Konfigurasi operasional
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Gunakan langkah ini saat menyiapkan cabang atau template baru. Editor tetap terpisah; perubahan berlaku untuk shift yang dibuka berikutnya.
            </p>
          </div>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Cabang', href: '/admin/cabang', description: 'Periksa cabang dan spreadsheet.' },
            { label: 'Shift', href: '/admin/shift', description: 'Atur definisi dan jadwal shift.' },
            { label: 'Checklist / SOP', href: '/admin/checklist', description: 'Atur kategori dan item kerja.' },
            { label: 'Handover', href: '/admin/handover', description: 'Riwayat & isian serah terima.' },
            { label: 'Akun & akses', href: '/admin/akun', description: 'Beri petugas akses cabang.' },
          ].map((step, index) => (
            <li key={step.href}>
              <Button asChild variant="outline" className="h-auto min-h-20 w-full justify-between whitespace-normal p-3 text-left">
                <Link href={step.href}>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Langkah {index + 1}
                    </span>
                    <span className="mt-1 block font-semibold">{step.label}</span>
                    <span className="mt-1 block text-xs font-normal text-ink-muted">{step.description}</span>
                  </span>
                  <ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </Button>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-muted">
          Ini urutan panduan, bukan indikator otomatis bahwa suatu konfigurasi sudah lengkap atau siap digunakan.
        </p>
      </section>

      <section aria-labelledby="monitoring-title" className="space-y-4">
        <div>
          <h2 id="monitoring-title" className="text-lg font-semibold">Monitoring operasional</h2>
          <p className="mt-1 text-sm text-ink-muted">Pantau shift aktif dan hal yang membutuhkan tindak lanjut.</p>
        </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Ringkasan per cabang</h2>
          </div>
          <div className="space-y-3">
            {branchStats.map((branch) => (
              <div key={branch.id} className="rounded-lg border border-border bg-canvas p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{branch.name}</p>
                    <p className="text-xs uppercase tracking-wide text-ink-muted">{branch.code}</p>
                  </div>
                  <div className="flex gap-2 text-xs text-ink-muted">
                    <span className="rounded-full border border-border px-2 py-1">{Number(branch.activeShifts)} jalan</span>
                    <span className="rounded-full border border-border px-2 py-1">{Number(branch.openIncidents)} incident</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-surface p-2">
                    <div className="text-ink-muted">Shift</div>
                    <div className="mt-1 text-base font-semibold">{Number(branch.activeShifts)}</div>
                  </div>
                  <div className="rounded-md bg-surface p-2">
                    <div className="text-ink-muted">Report</div>
                    <div className="mt-1 text-base font-semibold">{Number(branch.reportsToday)}</div>
                  </div>
                  <div className="rounded-md bg-surface p-2">
                    <div className="text-ink-muted">Open</div>
                    <div className="mt-1 text-base font-semibold">{Number(branch.openIncidents)}</div>
                  </div>
                </div>
              </div>
            ))}
            {branchStats.length === 0 && (
              <p className="text-sm text-ink-muted">Belum ada cabang aktif.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Peringatan</h2>
          </div>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-ink-muted">Tidak ada peringatan aktif.</p>
            ) : (
              alerts.map((alert, idx) => (
                <div key={`${alert.branchName}-${alert.shiftName}-${idx}`} className="rounded-lg border border-border bg-canvas p-3">
                  <p className="text-sm font-medium">{alert.branchName}</p>
                  <p className="mt-1 text-xs text-ink-muted">{alert.shiftName}</p>
                  <p className="mt-2 text-xs text-warning">
                    Shift berjalan sejak {alert.openedAt ? new Date(alert.openedAt).toLocaleString('id-ID') : '—'}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">PJ: {alert.pjName || '—'}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      </section>
    </div>
  );
}

function MetricCard({ href, label, value, helper }: { href: string; label: string; value: number; helper: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-border bg-surface p-4 text-center transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
      <p className="text-xs font-semibold uppercase leading-tight tracking-[0.14em] text-ink-muted sm:text-xs">
        {label}
      </p>
      <div className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">{value}</div>
      <p className="mt-1 text-xs text-ink-muted sm:text-xs">{helper}</p>
    </Link>
  );
}
