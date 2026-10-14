'use client';

// components/AuthTransitionOverlay.tsx
// Overlay QuantumLoader selama perpindahan sesi (login / logout).
//
// Kenapa perlu: `logout()` bersifat async (menunggu POST /api/auth/logout).
// Tanpa indikator, pengguna menekan "Keluar" lalu navbar masih tampil selama
// ~ratus milidetik sehingga tombolnya terasa tidak merespons. Overlay ini
// menutupi seluruh viewport selama proses berjalan.
//
// Styling memakai `QuantumLoaderOverlay` yang sama dengan halaman lain, jadi
// tampilan loader login/logout identik dengan loader halaman.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { QuantumLoaderOverlay } from '@/components/ui/QuantumLoader';

const TRANSITION_LABEL: Record<string, string> = {
  login: 'Memproses login…',
  logout: 'MengKeluar…',
};

export function AuthTransitionOverlay() {
  const { transition, clearTransition } = useAuth();
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  // Setelah logout selesai, AuthGuard mengarahkan ke /login. Di titik itu
  // overlay harus hilang agar form login bisa dipakai.
  //
  // Reset dilakukan HANYA saat pathname benar-benar berubah menjadi /login
  // (dari route sebelumnya), bukan saat kita sudah berada di /login. Kalau
  // dicek ulang setiap render, state 'login' yang sedang berjalan di halaman
  // /login akan ikut ter-cancel dan spinner-nya berkedip.
  useEffect(() => {
    const changed = pathname !== prevPathname.current;
    prevPathname.current = pathname;

    if (changed && pathname === '/login' && transition !== 'idle') {
      clearTransition();
    }
  }, [pathname, transition, clearTransition]);

  const label =
    transition === 'idle' ? null : TRANSITION_LABEL[transition] ?? 'Memuat';

  return (
    <AnimatePresence>
      {label && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <QuantumLoaderOverlay label={label} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
