'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, BookOpen, ClipboardCheck, FileText, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const LINKS = [
  { href: '/daftar-shift', label: 'Checklist', icon: ClipboardCheck },
  { href: '/incident', label: 'Incident', icon: AlertTriangle },
  { href: '/report', label: 'Laporan', icon: FileText },
  // Hanya di hamburger, tidak di bar bawah: bar bawah dibatasi 4 ikon supaya
  // target sentuh tetap nyaman di layar HP.
  { href: '/docs', label: 'Panduan', icon: BookOpen, inBottomBar: false },
];

const BOTTOM_LINKS = LINKS.filter((link) => link.inBottomBar !== false);

// "Checklist" juga menyala di halaman detail shift (/shift/<id>) karena itu
// kelanjutan dari pekerjaan checklist yang sama.
function isActive(pathname: string, href: string) {
  // Perhatikan: '/daftar-shift' TIDAK diawali '/shift', jadi harus dicek
  // terpisah. Bandingkan dengan '/shift/' (dengan slash) supaya path lain
  // yang diawali 'shift' tidak ikut kena.
  if (href === '/daftar-shift') {
    return pathname === '/daftar-shift' || pathname.startsWith('/shift/');
  }
  return pathname === href;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Navigasi petugas">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
              active ? 'bg-ink text-canvas' : 'text-ink hover:bg-canvas'
            }`}
          >
            <link.icon className="h-5 w-5" aria-hidden="true" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PetugasNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-30 -mx-4 hidden h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:flex md:-mx-6 md:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Buka menu navigasi">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="h-14 justify-center border-b border-border px-4 text-left">
              <SheetTitle className="text-sm font-bold">Navigasi Petugas</SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <Link href="/" className="text-sm font-bold text-ink">
          checklist-shift
        </Link>
        <span className="ml-auto text-xs text-ink-muted">
          {LINKS.find((link) => isActive(pathname, link.href))?.label}
        </span>
      </header>

      <nav
        aria-label="Navigasi petugas"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {BOTTOM_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                <link.icon className="h-5 w-5" aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
