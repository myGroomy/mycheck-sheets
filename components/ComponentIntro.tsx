'use client';

// Popup pengenalan komponen aplikasi (Shift, Checklist, Incident, Handover).
// Muncul otomatis sekali sebelum spotlight tour — urutan dikendalikan oleh
// lib/TourContext.tsx., bukan komponen ini.

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { IntroSlide } from '@/lib/tour';

export function ComponentIntro({
  slides,
  onDone,
  onSkipAll,
}: {
  slides: IntroSlide[];
  /** Slide intro selesai → lanjut dengan spotlight tour. */
  onDone: () => void;
  /** Pengguna melewat semua onboarding (intro + tour). */
  onSkipAll: () => void;
}) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const last = index === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/55 p-4" role="dialog" aria-modal="true" aria-label="Pengenalan MyCheck">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
        <button
          type="button"
          onClick={onSkipAll}
          className="absolute right-2 top-2 m-2 rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"
          aria-label="Lewati semua"
        >
          Lewati
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Pengenalan {index + 1} dari {slides.length}
        </p>
        <h2 className="mt-2 flex items-center gap-2 pr-12 text-lg font-bold">
        <slide.icon className="size-5 text-ink" aria-hidden />
          {slide.title}
        </h2>
        <p className="mt-2 min-h-20 text-sm leading-6 text-ink-muted">{slide.description}</p>
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i === index || i < index ? 'bg-ink' : 'bg-canvas'}`} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold hover:bg-canvas"
            >
              <ArrowLeft className="size-3.5" />Sebelumnya
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => (last ? onDone() : setIndex(index + 1))}
            className="inline-flex min-h-10 items-center gap-1 rounded-md bg-ink px-4 text-xs font-semibold text-surface hover:opacity-90"
            autoFocus
          >
            {last ? 'Mulai Tur' : 'Berikutnya'}<ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
