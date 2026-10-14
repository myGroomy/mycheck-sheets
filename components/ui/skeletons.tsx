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

/** Toolbar aksi di atas tabel (tombol refresh, filter, dsb). */
export function SkeletonToolbar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
  );
}

/** Tabel skeleton: header + `count` baris (5 kolom). */
export function SkeletonTable({ count = 8 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-4 border-b border-border bg-canvas px-4 py-3">
        {["w-32", "w-24", "w-20", "w-16", "w-12"].map((w, i) => (
          <Skeleton key={i} className={cn("h-3 shrink-0", w)} />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            {["w-32", "w-24", "w-20", "w-16", "w-12"].map((w, j) => (
              <Skeleton key={j} className={cn("h-3.5 shrink-0", w)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Baris skeleton untuk container yang sudah ada (tanpa border sendiri).
 * Dipakai halaman admin yang sudah membungkus daftar di dalam
 * `<div className="rounded-xl border border-border bg-surface">`.
 */
export function SkeletonRows({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Kartu skeleton untuk layout grid (incident, laporan, dsb). */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

