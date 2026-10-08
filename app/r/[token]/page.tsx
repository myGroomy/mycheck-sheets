import { AlertCircle } from 'lucide-react';
import { PublicReportView } from '@/components/report/public-report-view';
import { buildPublicReportDetail } from '@/lib/report-detail';
import type { Snapshot } from '@/lib/db/snapshot';

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await buildPublicReportDetail(token);

  if (result.state === 'invalid') {
    return (
      <PublicState
        title="Tautan laporan tidak valid"
        description="Tautan ini tidak aktif, sudah dicabut, atau sudah tidak berlaku."
      />
    );
  }

  if (result.state === 'expired') {
    return (
      <PublicState
        title="Tautan laporan kedaluwarsa"
        description="Tautan ini sudah kedaluwarsa dan tidak dapat dibuka lagi."
      />
    );
  }

  if (result.state === 'notfound') {
    return (
      <PublicState
        title="Laporan tidak ditemukan"
        description="Data laporan tidak ditemukan di sistem."
      />
    );
  }

  const d = result.detail;
  const toDate = (v: string | null): Date | null => (v ? new Date(v) : null);
  const EMPTY_SNAPSHOT = {
    v: 1,
    shift: { id: '', name: '', start_time: '', end_time: '', crosses_midnight: false },
    settings: { tolerance_default_minutes: 15, timezone: 'Asia/Jakarta' },
    categories: [],
    handover_fields: [],
  } as Snapshot;

  return (
    <PublicReportView
      data={{
        branch: { name: d.branch.name, code: d.branch.code },
        shift: {
          shiftDate: d.shift.shift_date,
          status: d.shift.status,
          openedAt: new Date(d.shift.opened_at),
          closedAt: toDate(d.shift.closed_at),
          pjName: d.shift.pj_name,
          snapshot: d.shift.template_snapshot ?? EMPTY_SNAPSHOT,
        },
        report: {
          reportNumber: d.report.report_number,
          generatedAt: new Date(d.report.generated_at),
          isLocked: d.report.is_locked,
          archivePdfDriveUrl: null,
          archivedPhotoCount: null,
        },
        entries: d.entries.map((e) => ({
          pointRef: e.pointRef,
          state: e.state as 'belum' | 'selesai' | 'skip',
          value: e.value === null ? null : String(e.value),
          skipReason: e.skipReason,
          timingLabel: e.timingLabel,
          completedByName: e.completedByName,
          completedAt: toDate(e.completedAt),
        })),
        participants: d.participants,
        handover: d.handover
          ? {
              values: d.handover.values,
              freeText: d.handover.free_text || null,
              submittedAt: new Date(d.handover.submitted_at),
            }
          : null,
        incidents: d.incidents.map((i) => ({
          id: i.id,
          categoryName: i.categoryName ?? '-',
          description: i.description,
          status: i.status,
          occurredAt: new Date(i.occurredAt),
        })),
        addenda: d.addenda.map((a) => ({
          id: a.id,
          note: a.note,
          authorName: a.authorName,
          createdAt: new Date(a.createdAt),
        })),
      }}
    />
  );
}

function PublicState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
      <div className="w-full rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{description}</p>
      </div>
    </main>
  );
}