import {
  SkeletonStatGrid,
  SkeletonHeader,
  SkeletonList,
} from "@/components/ui/skeletons";

/**
 * Fallback streaming untuk root route (App Router). Selama Server Component
 * halaman menyiapkan data, shell + skeleton ini dikirim duluan → konten
 * "terlihat" seketika (perceived load) tanpa layout shift.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 md:p-6">
      <SkeletonHeader />
      <SkeletonStatGrid />
      <SkeletonList count={4} />
    </main>
  );
}
