'use client';

import { FileClock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DraftRestoreDialog({
  pointCount,
  updatedAt,
  onContinue,
  onDiscard,
}: {
  pointCount: number;
  updatedAt: number;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="draft-restore-title" className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink"><FileClock className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 id="draft-restore-title" className="text-lg font-bold text-ink">Lanjutkan draft shift?</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">Ditemukan {pointCount} item yang belum dikirim. Draft terakhir disimpan {new Date(updatedAt).toLocaleString('id-ID')}.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onDiscard}><Trash2 className="mr-2 h-4 w-4" />Mulai baru</Button>
          <Button type="button" onClick={onContinue}>Lanjutkan draft</Button>
        </div>
      </section>
    </div>
  );
}

