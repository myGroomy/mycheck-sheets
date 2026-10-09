import { SkeletonList } from "@/components/ui/skeletons";

/** Fallback streaming untuk /incident (daftar insiden). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 animate-pulse rounded-md bg-ink/10" />
        <div className="h-9 w-28 animate-pulse rounded-md bg-ink/10" />
      </div>
      <SkeletonList count={6} />
    </main>
  );
}
