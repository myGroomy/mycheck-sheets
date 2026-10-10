import type { ReactNode } from 'react';

export interface ResponsiveRecordCardData {
  key: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  fields: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  details?: ReactNode;
}

export function ResponsiveRecordCards({
  records,
  loading = false,
  emptyMessage = 'Tidak ada data',
}: {
  records: ResponsiveRecordCardData[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-5 text-center text-sm text-ink-muted shadow-sm">
          Memuat...
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-5 text-center text-sm text-ink-muted shadow-sm">
          {emptyMessage}
        </div>
      ) : (
        records.map((record) => (
          <article
            key={record.key}
            className="rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-semibold text-ink">{record.title}</h2>
                {record.subtitle && (
                  <div className="mt-1 break-words text-xs text-ink-muted">
                    {record.subtitle}
                  </div>
                )}
              </div>
              {record.status && <div className="shrink-0">{record.status}</div>}
            </header>

            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {record.fields.map((field, index) => (
                <div key={`${field.label}-${index}`} className="min-w-0">
                  <dt className="text-xs font-medium text-ink-muted">{field.label}</dt>
                  <dd className="mt-1 break-words text-sm text-ink">{field.value}</dd>
                </div>
              ))}
            </dl>

            {record.details && (
              <div className="mt-4 border-t border-border pt-3">{record.details}</div>
            )}
            {record.actions && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                {record.actions}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
