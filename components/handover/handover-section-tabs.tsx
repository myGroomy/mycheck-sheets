'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Riwayat', href: '/admin/handover' },
  { label: 'Builder', href: '/admin/handover/builder' },
];

export function HandoverSectionTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Bagian handover" className="flex border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 items-center border-b-2 px-4 text-sm font-medium transition ${
              active ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
