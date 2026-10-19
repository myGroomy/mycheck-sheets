'use client';

// components/PageTransition.tsx
// Animasi perpindahan antar-halaman, disamakan dengan STOKIS:
//   AnimatePresence mode="wait" + initial={false} + motion.div key={pathname}
//   masuk : opacity 0→1, y 8→0,  durasi 0.25s, ease [0.25, 0.46, 0.45, 0.94]
//   keluar: opacity 1→0, y 0→-8, durasi 0.15s, ease 'easeIn'
//
// PENTING: komponen ini dipasang di `app/layout.tsx`, BUKAN `template.tsx`.
// Next.js memberi `template.tsx` key unik per navigasi, jadi seluruh subtree
// (termasuk AnimatePresence di dalamnya) di-unmount seketika dan animasi
// keluar tidak pernah sempat berjalan. Layout persisten, jadi AnimatePresence
// tetap hidup dan `key={pathname}`-lah yang memicu transisi masuk/keluar.

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  children: React.ReactNode;
}

/** Kurva easing yang sama dengan STOKIS (easeOutQuad). */
const EASE_STOKIS = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: EASE_STOKIS },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

/**
 * Varian tanpa pergeseran vertikal — dipakai untuk skeleton & spinner agar
 * tetap "transparan" tapi tidak bergeser posisi (placeholder tidak melompat).
 */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.2, ease: EASE_STOKIS } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } },
};

/** Padanan `pageVariants` untuk pengguna `prefers-reduced-motion` (fade saja). */
const pageVariantsReduced: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** Kontainer stagger untuk daftar/kartu (staggerChildren 0.06, sama dgn STOKIS). */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: EASE_STOKIS },
  },
};

/** Fade-in sederhana. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
};

/** Scale-in untuk modal/popup. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: EASE_STOKIS },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

/**
 * Transisi halaman. `initial={false}` supaya render pertama (SSR/hard load)
 * tidak ikut animasi — animasi hanya jalan saat pindah route.
 *
 * Kalau pengguna mengaktifkan `prefers-reduced-motion`, pergeseran y
 * dinonaktifkan (tetap ada fade halus) agar tidak bothersome.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        suppressHydrationWarning
        initial="initial"
        animate="enter"
        exit="exit"
        variants={reduceMotion ? pageVariantsReduced : pageVariants}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
