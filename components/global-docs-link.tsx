'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen } from 'lucide-react';

export function GlobalDocsLink() {
  const pathname = usePathname();

  if (pathname === '/docs') return null;

  return (
    <Link
      href="/docs"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-lg transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink md:bottom-4"
      aria-label="Buka panduan penggunaan"
    >
      <BookOpen className="h-4 w-4" aria-hidden="true" />
      Panduan
    </Link>
  );
}
