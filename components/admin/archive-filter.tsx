'use client';

import { Archive, ListChecks, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Filter status data untuk halaman admin: mode Aktif (default, data kerja) dan
 * mode Arsip (data nonaktif yang dapat dicari lalu dipulihkan).
 *
 * Kolom pencarian muncul selama `onSearchChange` diberikan, bukan hanya di mode
 * arsip — beberapa halaman (mis. Cabang) memakai satu pencarian untuk kedua
 * mode.
 */
export function ArchiveFilter({
  archived,
  onChange,
  activeCount,
  archivedCount,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Cari data arsip...',
}: {
  archived: boolean;
  onChange: (archived: boolean) => void;
  activeCount: number;
  archivedCount: number;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter status data">
        <Button
          type="button"
          size="sm"
          variant={archived ? 'outline' : 'default'}
          aria-pressed={!archived}
          onClick={() => onChange(false)}
        >
          <ListChecks className="mr-2 h-4 w-4" aria-hidden="true" />
          Aktif ({activeCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={archived ? 'default' : 'outline'}
          aria-pressed={archived}
          onClick={() => onChange(true)}
        >
          <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
          Arsip ({archivedCount})
        </Button>
      </div>
      {onSearchChange && (
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input
            value={searchValue ?? ''}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}
    </div>
  );
}
