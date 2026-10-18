'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import type { TourStep } from '@/lib/tour';

type Rect = { top: number; left: number; width: number; height: number };

function findVisible(selector?: string): Element | null {
  if (!selector) return null;
  for (const element of document.querySelectorAll(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

function getPosition(rect: Rect | null, placement: TourStep['placement']) {
  if (!rect || placement === 'center') {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  }
  const width = Math.min(340, window.innerWidth - 24);
  const gap = 14;
  const maxLeft = Math.max(12, window.innerWidth - width - 12);
  const left = Math.min(Math.max(12, rect.left), maxLeft);
  const bottom = rect.top + rect.height;
  const top = placement === 'top'
    ? Math.max(12, rect.top - 230)
    : Math.min(window.innerHeight - 250, bottom + gap);
  return { left: `${left}px`, top: `${Math.max(12, top)}px` };
}

export function OnboardingTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const step = steps[index];

  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const target = findVisible(step.selector);
    if (!target) {
      setRect(null);
      return;
    }
    target.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    const next = target.getBoundingClientRect();
    setRect({ top: next.top, left: next.left, width: next.width, height: next.height });
  }, [reducedMotion, step]);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (!step) return;
    if (step.path && pathname !== step.path) {
      router.push(step.path);
      return;
    }
    const timers = [0, 250, 800].map((delay) => window.setTimeout(measure, delay));
    const update = () => measure();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [measure, pathname, router, step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) setIndex((value) => value - 1);
      if (event.key === 'ArrowRight' && index < steps.length - 1) setIndex((value) => value + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, onClose, steps.length]);

  const position = useMemo(() => getPosition(rect, step?.placement), [rect, step?.placement]);
  if (!step) return null;

  const finish = () => onClose();
  const next = () => index === steps.length - 1 ? finish() : setIndex((value) => value + 1);

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Tutorial MyCheck">
      {rect && (
        <div
          className="pointer-events-none fixed rounded-xl transition-[top,left,width,height] duration-200"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(41, 37, 36, 0.52)' }}
          aria-hidden="true"
        />
      )}
      {!rect && <div className="absolute inset-0 bg-stone-900/55" aria-hidden="true" />}
      <div
        className="fixed w-[min(340px,calc(100vw-24px))] rounded-2xl border border-border bg-surface p-5 text-ink shadow-2xl"
        style={position}
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Tutup tutorial">
          <X className="h-4 w-4" />
        </button>
        <p className="pr-7 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{index + 1} dari {steps.length}</p>
        <h2 className="mt-2 pr-7 text-base font-bold">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{step.description}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-2 py-2 text-xs font-semibold text-ink-muted hover:bg-canvas hover:text-ink">Lewati</button>
          <div className="flex items-center gap-2">
            {index > 0 && <button type="button" onClick={() => setIndex((value) => value - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold hover:bg-canvas"><ArrowLeft className="h-3.5 w-3.5" />Sebelumnya</button>}
            <button type="button" onClick={next} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-ink px-3 text-xs font-semibold text-surface hover:opacity-90">{index === steps.length - 1 ? 'Selesai' : 'Berikutnya'}<ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
