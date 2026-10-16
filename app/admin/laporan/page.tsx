import { ReportList } from '@/components/report/report-list';

export default function AdminReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Laporan Shift Lintas Cabang</h1>
        <p className="text-sm text-ink-muted">Kelola, tinjau, dan bagikan laporan shift seluruh cabang.</p>
      </div>
      <ReportList role="admin" />
    </div>
  );
}
