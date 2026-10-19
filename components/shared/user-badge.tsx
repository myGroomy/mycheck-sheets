// components/shared/user-badge.tsx
// Fase 16 — badge atribusi item: nama user yang mengerjakan/permintaan.
// Terbaca di mobile, dark/light surface, print, dan screen reader
// (nama muncul sebagai teks, ikon `aria-hidden`).

import { UserRound } from 'lucide-react';

export function UserBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 font-medium text-ink"
      title={`Dikerjakan oleh ${name}`}
    >
      <UserRound className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}
