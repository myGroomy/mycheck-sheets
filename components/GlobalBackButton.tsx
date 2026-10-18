'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { isStandalonePath } from '@/lib/nav-config';

function fallbackFor(pathname: string): string {
  if (pathname === '/login') return '/';
  if (pathname === '/setup-akun') return '/login';
  if (pathname.startsWith('/docs')) return '/';
  if (pathname.startsWith('/r/')) return '/';
  if (pathname === '/maintenance') return '/';
  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/checklist/')) return '/admin/checklist';
    if (pathname.startsWith('/admin/handover/')) return '/admin/handover';
    if (pathname.startsWith('/admin/incident/')) return '/admin/incident';
    return '/admin';
  }
  if (pathname.startsWith('/shift/')) return '/daftar-shift';
  if (pathname.startsWith('/incident/')) return '/incident';
  if (pathname.startsWith('/report/')) return '/report';
  return '/';
}

export function GlobalBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const standalone = isStandalonePath(pathname);

  if (pathname === '/' || pathname.startsWith('/docs')) return null;

  const goBack = () => {
    const historyIndex = window.history.state?.idx;
    const canGoBack = typeof historyIndex === 'number'
      ? historyIndex > 0
      : window.history.length > 1;

    if (canGoBack) router.back();
    else router.push(fallbackFor(pathname));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-4">
      <div className={`mx-auto max-w-7xl ${standalone ? '' : 'md:pl-64'}`}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-events-auto bg-surface/95 shadow-sm backdrop-blur"
          onClick={goBack}
          aria-label="Kembali"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Kembali
        </Button>
      </div>
    </div>
  );
}
