import {
  SkeletonStatGrid,
  SkeletonHeader,
  SkeletonList,
} from "@/components/ui/skeletons";
import { SkeletonTransition } from "@/components/ui/skeleton-transition";

/**
 * Fallback streaming untuk root route (App Router). Selama Server Component
 * halaman menyiapkan data, shell + skeleton ini dikirim duluan → konten
 * "terlihat" seketika (perceived load) tanpa layout shift.
 *
 * `SkeletonTransition` memberi fade-in agar skeleton tidak muncul mendadak.
 */
export default function Loading() {
  return (
    <SkeletonTransition>
      <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
        <SkeletonHeader />
        <SkeletonStatGrid />
        <SkeletonList count={4} />
      </main>
    </SkeletonTransition>
  );
}
