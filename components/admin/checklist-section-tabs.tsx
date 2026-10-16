'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Riwayat', href: '/admin/checklist' },
  { label: 'Builder', href: '/admin/checklist/builder' },
];

export function ChecklistSectionTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Bagian checklist" className="flex border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 items-center border-b-2 px-4 text-sm font-medium transition ${
              active
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}