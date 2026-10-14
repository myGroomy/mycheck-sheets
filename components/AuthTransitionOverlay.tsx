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

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { QuantumLoaderOverlay } from '@/components/ui/QuantumLoader';

const TRANSITION_LABEL: Record<string, string> = {
  login: 'Memproses login…',
  logout: 'MengKeluar…',
};

export function AuthTransitionOverlay() {
  const { transition, clearTransition, user } = useAuth();
  // Setelah logout selesai, `user` menjadi null lalu AuthGuard mengarahkan
  // ke halaman login. Overlay harus hilang setelah redirect terjadi.
  //
  // Reset TIDAK bergantung pada pathname. Dulu condition-nya
  // `pathname === '/login'`, tapi itu tidak bisa diandalkan:
  //   - AuthGuard bisa mengarahkan ke '/' bila session masih terbaca,
  //   - redirect beruntun (/daftar-shift -> /login -> /) bisa membuat React
  //     melompati render '/login' sehingga condition-nya tidak pernah cocok,
  //   - akibatnya overlay menggantung selamanya dan memblokir seluruh aplikasi.
  //
  // Yang dipakai sekarang: begitu `user` null (logout benar-benar selesai),
  // beri jeda singkat untuk redirect, lalu pasti bersihkan overlay. Pakai
  // jeda, bukan reset langsung, supaya tidak ada kedipan halaman lama
  // sesaat sebelum redirect terjadi. Timeout juga menjamin overlay tidak
  // pernah menggantung walau redirect gagal total.
  useEffect(() => {
    if (transition === 'idle') return;

    const done = transition === 'logout' && user === null;
    // 'login' di-reset hanya lewat clearTransition() dari AuthContext
    // (kegagalan login) atau full page reload dari window.location.assign.
    if (!done) return;

    const t = window.setTimeout(clearTransition, 600);
    return () => window.clearTimeout(t);
  }, [transition, user, clearTransition]);

  // Pengaman terakhir: kalau sebuah transisi berjalan terlalu lama (mis.
  // request menggantung), lepaskan overlay agar UI tidak terkunci.
  useEffect(() => {
    if (transition === 'idle') return;
    const t = window.setTimeout(clearTransition, 8000);
    return () => window.clearTimeout(t);
  }, [transition, clearTransition]);

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
