import { AlertTriangle, CheckCircle2, Circle, FileText, MinusCircle, Users } from 'lucide-react';
import type { Snapshot } from '@/lib/db/snapshot';
import { PublicReportActions } from '@/components/report/public-report-actions';
import { containsPhotoId, formatReportValue } from '@/lib/shared/report-values';

export interface PublicReportViewData {
  branch: { name: string; code: string } | null;
  shift: {
    shiftDate: string;
    status: string;
    openedAt: Date;
    closedAt: Date | null;
    pjName: string | null;
    snapshot: Snapshot;
  };
  report: {
    reportNumber: string;
    generatedAt: Date;
    isLocked: boolean;
    archivePdfDriveUrl: string | null;
    archivedPhotoCount: number | null;
  };
  entries: Array<{
    pointRef: string;
    state: 'belum' | 'selesai' | 'skip';
    value: string | null;
    skipReason: string | null;
    timingLabel: string | null;
    completedByName: string | null;
    completedAt: Date | null;
  }>;
  participants: Array<{ id: string; name: string; isPj: boolean; itemsDone: number }>;
  handover: { id: string; values: unknown; freeText: string | null; submittedAt: Date } | null;
  incidents: Array<{
    id: string;
    categoryName: string;
    description: string;
    status: string;
    occurredAt: Date;
  }>;
  addenda: Array<{ id: string; note: string; authorName: string; createdAt: Date }>;
  photos: Array<{
    id: string;
    ownerType: string;
    ownerId: string;
    mime: string;
    uploadedAt: string;
    status: string;
    src: string;
  }>;
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

const TIMING_LABELS: Record<string, string> = {
  tepat_waktu: 'Tepat waktu',
  lebih_awal: 'Lebih awal',
  terlambat: 'Terlambat',
};
const INPUT_TYPE_LABELS: Record<string, string> = {
  centang: 'Centang checklist',
  foto: 'Foto',
  teks: 'Jawaban singkat',
  angka: 'Angka',
  ok_tidak_ok: 'OK / Tidak OK',
  paragraf: 'Paragraf',
  pilihan_ganda: 'Pilihan ganda',
  kotak_centang: 'Pilihan jamak',
  dropdown: 'Dropdown',
  tanggal_waktu: 'Tanggal dan waktu',
};

function displayEntryValue(inputType: string, value: string | null): string | null {
  if (inputType === 'tanggal_waktu' && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID');
  }
  if (!value || inputType !== 'kotak_centang') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).join(', ') : value;
  } catch {
    return value;
  }
}

export function PublicReportView({
  data,
  showCopyLink = true,
}: {
  data: PublicReportViewData;
  showCopyLink?: boolean;
}) {
  const entryByRef = new Map(data.entries.map((entry) => [entry.pointRef, entry]));
  const snapshot = data.shift.snapshot;
  const categories = Array.isArray(snapshot?.categories)
    ? snapshot.categories.map((category) => ({
        ...category,
        points: Array.isArray(category.points) ? category.points : [],
      }))
    : [];
  const handoverFields = Array.isArray(snapshot?.handover_fields) ? snapshot.handover_fields : [];
  const allPoints = categories.flatMap((category) => category.points);
  const pointTitleByRef = new Map(allPoints.map((point) => [point.point_ref, point.title]));
  const attachedPhotos = data.photos.filter((photo) => {
    const entry = entryByRef.get(photo.ownerId);
    if (photo.status !== 'uploaded') return false;
    if (photo.ownerType === 'entry') {
      return pointTitleByRef.has(photo.ownerId) &&
        entry?.state === 'selesai' &&
        containsPhotoId(entry.value, photo.id);
    }
    if (photo.ownerType === 'handover') {
      return data.handover?.id === photo.ownerId &&
        containsPhotoId(data.handover.values, photo.id);
    }
    return photo.ownerType === 'incident' &&
      data.incidents.some((incident) => incident.id === photo.ownerId);
  });
  const done = allPoints.filter((point) => entryByRef.get(point.point_ref)?.state === 'selesai').length;
  const skipped = allPoints.filter((point) => entryByRef.get(point.point_ref)?.state === 'skip').length;
  const progressPercent = allPoints.length ? Math.round(((done + skipped) / allPoints.length) * 100) : 0;
  const handoverValues =
    data.handover?.values && typeof data.handover.values === 'object'
      ? (data.handover.values as Record<string, unknown>)
      : {};

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 print:max-w-none print:space-y-3 print:p-0">
      <style>{'@media print { header.sticky, nav.fixed { display: none !important; } }'}</style>
      <header className="rounded-2xl border border-border bg-surface p-5 shadow-sm print:rounded-none print:border print:bg-white print:p-3 print:shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
              Laporan shift · {data.branch?.code ?? 'Cabang'}
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{data.branch?.name ?? 'Cabang'}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {snapshot?.shift?.name || 'Shift'} · {new Date(`${data.shift.shiftDate}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'long' })}
            </p>
          </div>
          <PublicReportActions showCopy={showCopyLink} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Nomor laporan" value={data.report.reportNumber} />
          <Meta label="Penanggung jawab" value={data.shift.pjName ?? 'Tidak tersedia'} />
          <Meta label="Dibuka" value={new Date(data.shift.openedAt).toLocaleString('id-ID')} />
          <Meta label="Ditutup" value={data.shift.closedAt ? new Date(data.shift.closedAt).toLocaleString('id-ID') : statusText(data.shift.status)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> {data.report.isLocked ? 'Laporan terkunci' : 'Laporan terbuka'}
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-ink-muted">
            Dibuat {new Date(data.report.generatedAt).toLocaleString('id-ID')}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2" aria-label="Ringkasan laporan">
        <Metric label="Progress checklist" value={`${done + skipped}/${allPoints.length}`} detail={`${progressPercent}% terselesaikan`} />
        <Metric label="Selesai" value={String(done)} detail="Item dikerjakan" />
        <Metric label="Skip" value={String(skipped)} detail="Dengan alasan tercatat" />
        <Metric label="Incident" value={String(data.incidents.length)} detail={`${data.incidents.filter((incident) => incident.status === 'open').length} masih terbuka`} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 print:break-inside-auto print:rounded-none print:border-0 print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Checklist shift</h2>
            <p className="text-sm text-ink-muted">Status, bukti nilai, dan pengisi tiap item.</p>
          </div>
          <div className="min-w-40">
            <div className="h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-1 text-right text-xs text-ink-muted">{progressPercent}%</p>
          </div>
        </div>
        <div className="mt-5 space-y-5">
          {categories.map((category) => {
            const categoryDone = category.points.filter((point) => {
              const state = entryByRef.get(point.point_ref)?.state;
              return state === 'selesai' || state === 'skip';
            }).length;
            return (
              <section key={category.id} className="break-inside-avoid rounded-xl border border-border bg-canvas p-4 sm:p-5 print:rounded-none print:border print:bg-white print:p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{category.name}</h3>
                  <span className="text-xs text-ink-muted">{categoryDone}/{category.points.length} selesai/skip</span>
                </div>
                <div className="mt-3 divide-y divide-border">
                  {category.points.map((point) => {
                    const entry = entryByRef.get(point.point_ref);
                    const state = entry?.state ?? 'belum';
                    const Icon = state === 'selesai' ? CheckCircle2 : state === 'skip' ? MinusCircle : Circle;
                    return (
                      <article key={point.point_ref} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${state === 'selesai' ? 'text-emerald-700' : state === 'skip' ? 'text-amber-700' : 'text-ink-muted'}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{point.title}{point.is_required && <span className="ml-1 text-xs text-error">Wajib</span>}</p>
                              <p className="mt-1 text-xs text-ink-muted">{INPUT_TYPE_LABELS[point.input_type] ?? point.input_type}</p>
                            </div>
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs">
                              {state === 'selesai' ? 'Selesai' : state === 'skip' ? 'Skip' : 'Belum'}
                            </span>
                          </div>
                          {point.instruction && <p className="mt-1 text-sm text-ink-muted">{point.instruction}</p>}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                            {entry?.value && <span className="whitespace-pre-wrap break-words">Nilai: {point.input_types && point.input_types.length > 1 ? formatReportValue(parseValue(entry.value)) : displayEntryValue(point.input_type, entry.value)}</span>}
                            {entry?.skipReason && <span>Alasan: {entry.skipReason}</span>}
                            {entry?.completedByName && <span>Oleh: {entry.completedByName}</span>}
                            {entry?.completedAt && <span>{new Date(entry.completedAt).toLocaleString('id-ID')}</span>}
                            {entry?.timingLabel && <span>{TIMING_LABELS[entry.timingLabel] ?? entry.timingLabel}</span>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {attachedPhotos.length > 0 && (
        <section className="break-inside-auto rounded-2xl border border-border bg-surface p-5 print:rounded-none print:border print:p-3">
          <h2 className="text-lg font-bold">Lampiran foto</h2>
          <p className="mt-1 text-sm text-ink-muted">Lampiran foto checklist, handover, dan incident.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
            {attachedPhotos.map((photo) => (
              <figure key={photo.id} className="break-inside-avoid overflow-hidden rounded-xl border border-border bg-canvas print:rounded-none">
                <a href={photo.src} target="_blank" rel="noreferrer" aria-label={`Buka lampiran foto: ${pointTitleByRef.get(photo.ownerId) ?? (photo.ownerType === 'handover' ? 'Handover' : 'Incident')}`}>
                  <img
                    src={photo.src}
                    alt={`Lampiran foto — ${pointTitleByRef.get(photo.ownerId) ?? (photo.ownerType === 'handover' ? 'Handover' : 'Incident')}`}
                    loading="eager"
                    className="aspect-[4/3] w-full object-contain print:max-h-64 print:object-contain"
                  />
                </a>
                <figcaption className="border-t border-border p-3">
                  <p className="text-sm font-medium">{pointTitleByRef.get(photo.ownerId) ?? (photo.ownerType === 'handover' ? 'Handover' : 'Incident')}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Diunggah {new Date(photo.uploadedAt).toLocaleString('id-ID')}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
        <section className="break-inside-avoid rounded-2xl border border-border bg-surface p-5 print:rounded-none print:border print:bg-white print:p-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5" /> Peserta shift</h2>
          {data.participants.length ? (
            <ul className="mt-3 divide-y divide-border">
              {data.participants.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <span className="font-medium">{person.name}{person.isPj && <span className="ml-2 rounded-full bg-canvas px-2 py-1 text-xs">PJ</span>}</span>
                  <span className="text-sm text-ink-muted">{person.itemsDone} item</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-ink-muted">Data peserta tidak tersedia.</p>}
        </section>

        <section className="break-inside-avoid rounded-2xl border border-border bg-surface p-5 print:rounded-none print:border print:bg-white print:p-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5" /> Handover</h2>
          {data.handover ? (
            <div className="mt-3 space-y-3">
              {handoverFields.map((field) => {
                const value = handoverValues[field.id];
                return (
                  <div key={field.id} className="rounded-lg border border-border bg-canvas p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{field.label}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {value === undefined || value === null || value === ''
                        ? '—'
                        : (field.input_types ?? [field.field_type]).length === 1 &&
                            (field.input_types ?? [field.field_type])[0] === 'foto' &&
                            Array.isArray(value)
                          ? `${value.length} foto terlampir`
                          : formatReportValue(value)}
                    </p>
                  </div>
                );
              })}
              {data.handover.freeText && <p className="whitespace-pre-wrap rounded-lg border border-border bg-canvas p-3 text-sm">{data.handover.freeText}</p>}
              <p className="text-xs text-ink-muted">Dikirim {new Date(data.handover.submittedAt).toLocaleString('id-ID')}</p>
            </div>
          ) : <p className="mt-3 text-sm text-ink-muted">Tidak ada handover.</p>}
        </section>

        <section className="break-inside-avoid rounded-2xl border border-border bg-surface p-5 print:rounded-none print:border print:bg-white print:p-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="h-5 w-5" /> Incident</h2>
          {data.incidents.length ? (
            <div className="mt-3 space-y-3">
              {data.incidents.map((incident) => (
                <article key={incident.id} className="rounded-lg border border-border bg-canvas p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{incident.categoryName}</p>
                    <span className="text-xs text-ink-muted">{incident.status === 'open' ? 'Terbuka' : 'Selesai'}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{incident.description}</p>
                  <p className="mt-2 text-xs text-ink-muted">{new Date(incident.occurredAt).toLocaleString('id-ID')}</p>
                </article>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-ink-muted">Tidak ada incident pada shift ini.</p>}
        </section>

        <section className="break-inside-avoid rounded-2xl border border-border bg-surface p-5 print:rounded-none print:border print:bg-white print:p-3">
          <h2 className="text-lg font-bold">Addendum</h2>
          {data.addenda.length ? (
            <ol className="mt-3 space-y-3">
              {data.addenda.map((item) => (
                <li key={item.id} className="border-l-2 border-border pl-3">
                  <p className="whitespace-pre-wrap text-sm">{item.note}</p>
                  <p className="mt-1 text-xs text-ink-muted">{item.authorName} · {new Date(item.createdAt).toLocaleString('id-ID')}</p>
                </li>
              ))}
            </ol>
          ) : <p className="mt-3 text-sm text-ink-muted">Belum ada addendum.</p>}
        </section>
      </div>

      {data.report.archivePdfDriveUrl && (
        <section className="rounded-xl border border-border bg-canvas p-4 text-sm print:break-inside-avoid print:rounded-none print:border print:bg-white">
          <p>{data.report.archivedPhotoCount ?? 0} foto bukti telah diarsip.</p>
          <a className="mt-2 inline-block font-semibold underline" href={data.report.archivePdfDriveUrl} target="_blank" rel="noreferrer">
            Buka arsip foto (PDF)
          </a>
        </section>
      )}
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-canvas p-3"><p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-center print:rounded-none print:border print:bg-white print:p-2"><p className="text-[11px] uppercase leading-tight tracking-wide text-ink-muted sm:text-xs">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-ink-muted sm:text-xs">{detail}</p></div>;
}

function statusText(status: string) {
  if (status === 'ditutup_paksa') return 'Ditutup paksa';
  if (status === 'ditutup') return 'Ditutup';
  return status;
}
