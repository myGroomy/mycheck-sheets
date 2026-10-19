'use client';

// components/ui/action-progress.tsx
// Loading line global (Fase 14): satu batang tipis di tepi atas layar yang
// tampil saat ada request /api/ berjalan. Dipasang sekali di root layout,
// membungkus window.fetch sehingga semua aksi (preview, backup, copy, sync,
// close, finalisasi review, export) otomatis tercakup tanpa wiring per-file.
// Menghormati prefers-reduced-motion (bar statis, tanpa animasi).

import { useEffect, useRef, useState } from 'react';

export function ActionProgress() {
  const [inFlight, setInFlight] = useState(0);
  const activeRef = useRef(0);

  useEffect(() => {
    const original = window.fetch.bind(window);
    const wrapped: typeof window.fetch = (input, init) => {
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.pathname
        : input.url;
      const isInternal = url.includes('/api/');
      if (!isInternal) return original(input, init);
      activeRef.current += 1;
      setInFlight(activeRef.current);
      return original(input, init).finally(() => {
        activeRef.current = Math.max(0, activeRef.current - 1);
        setInFlight(activeRef.current);
      });
    };
    window.fetch = wrapped;
    return () => {
      window.fetch = original;
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-busy={inFlight > 0}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-150 print:hidden ${
        inFlight > 0 ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {inFlight > 0 && (
        <div
          className={`sheet-progress-line h-full w-full origin-left bg-primary motion-reduce:animate-none`}
        />
      )}
    </div>
  );
}
