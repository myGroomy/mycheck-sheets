import {
  SkeletonList,
  SkeletonHeader,
} from "@/components/ui/skeletons";
import { SkeletonTransition } from "@/components/ui/skeleton-transition";

/** Fallback streaming untuk /report/[id] (detail laporan). */
export default function Loading() {
  return (
    <SkeletonTransition>
      <main className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
        <SkeletonHeader />
        <SkeletonList count={5} />
      </main>
    </SkeletonTransition>
  );
}
