import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton bersama untuk halaman ber-data (streaming `loading.tsx` & state loading
 * di komponen client). Bentuknya sengaja meniru layout konten asli MYCHECK
 * (kartu statistik + daftar) supaya tidak ada layout shift saat data tiba.
 */

/** Baris skeleton generik (judul + subjudul). */
export function SkeletonLine({
  className,
  width = "w-40",
}: {
  className?: string;
  width?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className={cn("h-4", width)} />
      <Skeleton className={cn("h-3 w-24")} />
    </div>
  );
}

/** Grid kartu statistik (4 kolom di desktop). */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-surface p-4 space-y-3"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Daftar skeleton (n baris). */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Header halaman (judul besar + sapaan). */
export function SkeletonHeader() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
