import { cn } from "@/lib/utils";

/**
 * Skeleton — placeholder abu berdenyut (animate-pulse) untuk state loading.
 * Dipakai di dalam komponen client & `loading.tsx` (streaming App Router)
 * agar konten "terlihat" seketika tanpa layout shift saat data tiba.
 *
 * Gunakan lebar/tinggi yang meniru elemen asli (mis. `h-4 w-24`, `h-32`).
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-ink/10", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
