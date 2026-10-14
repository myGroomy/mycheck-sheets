'use client';

// components/ui/skeleton-transition.tsx
// Pembungkus transisi untuk skeleton & spinner.
//
// Pendekatan (sama seperti STOKIS): skeleton TETAP `animate-pulse` polos, tapi
// dibungkus motion supaya ia masuk/keluar dengan fade yang sama dengan page
// transition. Tanpa ini skeleton akan "nempel tiba-tiba" saat konten diganti
// dan transisinya terasa melompat.
//
// Dipakai di dua tempat:
//   1. `SkeletonTransition` — bungkus skeleton di dalam `loading.tsx`
//      (server component tetap aman; hanya wrapper-nya yang client).
//   2. `LoadingCrossfade`  — untuk state loading di komponen client:
//      skeleton <-> konten melakukan crossfade, bukan hard swap.

import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeVariants } from '@/components/PageTransition';
import { QuantumLoaderMini } from '@/components/ui/QuantumLoader';

/**
 * Fade-in saat skeleton pertama kali tampil. `initial={false}` dipakai supaya
 * render pertama (SSR/hard load) tidak berkedip — animasi baru jalan saat
 * skeleton muncul setelah navigasi atau setelah data mulai dimuat.
 */
export function SkeletonTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="enter"
      variants={fadeVariants}
    >
      {children}
    </motion.div>
  );
}

/**
 * Crossfade antara skeleton dan konten asli.
 *
 * Dipakai di komponen client yang fetch sendiri (`loading ? skeleton : data`).
 * Dengan `mode="wait"`, skeleton selesai memudar dulu sebelum konten masuk —
 * persis pola `AnimatePresence mode="wait"` yang dipakai <PageTransition />.
 *
 * Contoh:
 *   <LoadingCrossfade
 *     loading={loading}
 *     skeleton={<SkeletonList count={6} />}
 *   >
 *     <IncidentTable incidents={data} />
 *   </LoadingCrossfade>
 */
export function LoadingCrossfade({
  loading,
  skeleton,
  children,
  className,
  skeletonKey = 'skeleton',
  contentKey = 'content',
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  skeletonKey?: string;
  contentKey?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loading ? skeletonKey : contentKey}
        className={cn(className)}
        initial="initial"
        animate="enter"
        exit="exit"
        variants={fadeVariants}
      >
        {loading ? skeleton : children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Stagger container untuk skeleton — setiap blok muncul sedikit demi sedikit
 * (staggerChildren 0.06, sama dengan STOKIS) supaya terasa "dimuat bertahap"
 * dan tidak seperti satu blok yang nyala mendadak.
 *
 * Pasangkan dengan `skeletonItem`:
 *   <motion.div variants={skeletonContainer} initial="hidden" animate="show">
 *     <Skeleton variants={skeletonItem} ... />
 *   </motion.div>
 */
export const skeletonContainer: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

export const skeletonItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

/**
 * Petunjuk memuat ringkas untuk area yang isinya tidak berbentuk daftar
 * (mis. satu blok pengaturan atau panel detail). Pakai spinner branded
 * MYCHECK, bukan teks polos.
 *
 *   <LoadingHint>Memuat pengaturan…</LoadingHint>
 */
export function LoadingHint({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(
        'flex items-center justify-center gap-2.5 p-4 text-sm text-ink-muted',
        className
      )}
      role="status"
      aria-label="Memuat"
      initial="initial"
      animate="enter"
      variants={fadeVariants}
    >
      <QuantumLoaderMini />
      {children ?? 'Memuat...'}
    </motion.div>
  );
}
