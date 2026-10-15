import { SkeletonRows } from '@/components/ui/skeletons';
import { SkeletonTransition } from '@/components/ui/skeleton-transition';

/** Fallback streaming untuk /handover (riwayat serah terima). */
export default function Loading() {
  return (
    <SkeletonTransition>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-24 sm:px-6 sm:py-6 md:pb-10">
        <div className="space-y-2">
          <div className="h-6 w-28 animate-pulse rounded bg-ink/10" />
          <div className="h-3 w-64 animate-pulse rounded bg-ink/10" />
        </div>
        <SkeletonRows count={4} />
      </main>
    </SkeletonTransition>
  );
}
