import {
  SkeletonStatGrid,
  SkeletonList,
} from "@/components/ui/skeletons";

/** Fallback streaming untuk /shift/[id] (detail checklist shift). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-ink/10" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-ink/10" />
      </div>
      <SkeletonStatGrid count={3} />
      <SkeletonList count={5} />
    </main>
  );
}
