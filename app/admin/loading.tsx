import {
  SkeletonStatGrid,
  SkeletonList,
  SkeletonToolbar,
} from "@/components/ui/skeletons";
import { SkeletonTransition } from "@/components/ui/skeleton-transition";

/**
 * Fallback streaming untuk area /admin. Berlaku untuk `/admin` dan seluruh
 * sub-rutenya (`app/admin/layout.tsx` memanggil requireAdmin() yang bisa
 * suspense saat session diverifikasi).
 */
export default function Loading() {
  return (
    <SkeletonTransition>
      <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
        <div className="space-y-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-ink/10" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-ink/10" />
        </div>
        <SkeletonStatGrid count={4} />
        <SkeletonToolbar />
        <SkeletonList count={6} />
      </main>
    </SkeletonTransition>
  );
}
