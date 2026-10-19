'use client';

// components/AuthGuard.tsx
// Adaptasi pola STOKIS. Perbedaan penting dari versi STOKIS: MYCHECK memakai
// server-side auth (requireUser/requireAdmin di layout server component), jadi
// AuthGuard ini TIDAK mem-block render dengan spinner semua halaman sudah
// di-render di server. Yang saya ambil adalah logika redirect-nya:
//   - user tidak login → arahkan ke /login
//   - sudah login tapi buka /login → arahkan ke beranda sesuai role
//   - non-admin membuka /admin/* → arahkan ke /

import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { usePathname, useRouter } from 'next/navigation';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Alasan redirect terakhir. Dipakai untuk mencegah loop, BUKAN untuk
  // menghentikan effect setelah pemeriksaan pertama.
  //
  // Versi lama memakai `checked = useRef(false)` yang di-set true sekali lalu
  // tidak pernah di-reset, sehingga effect langsung return pada pemanggilan
  // berikutnya. Akibatnya saat user logout (user jadi null), guard tidak
  // pernahevaluated lagi → tidak ada redirect ke /login, dan pengguna tetap
  // terjebak di halaman asalnya. AuthGuard ter-mount di root layout sehingga
  // tidak pernah remount saat navigasi client-side.
  const lastAction = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (user?.requiresSetup && pathname !== '/setup-akun') {
      if (lastAction.current !== 'to:/setup-akun') {
        lastAction.current = 'to:/setup-akun';
        router.replace('/setup-akun');
      }
      return;
    }

    if (pathname === '/setup-akun' && user && !user.requiresSetup) {
      const target = user.role === 'admin' ? '/admin' : '/daftar-shift';
      if (lastAction.current !== `to:${target}`) {
        lastAction.current = `to:${target}`;
        router.replace(target);
      }
      return;
    }

    // Sudah login tapi masih di /login → tujuan sesuai role
    if (pathname === '/login' && user) {
      const target = user.role === 'admin' ? '/admin' : '/';
      if (lastAction.current !== `to:${target}`) {
        lastAction.current = `to:${target}`;
        router.replace(target);
      }
      return;
    }

    // Non-admin membuka area admin
    if (user && !isAdmin && pathname.startsWith('/admin')) {
      if (lastAction.current !== 'to:/') {
        lastAction.current = 'to:/';
        router.replace('/');
      }
      return;
    }

    const isPublic =
      pathname === '/' ||
      pathname === '/login' ||
      pathname.startsWith('/r/');

    // Belum login, bukan route publik → ke /login
    // INI cabang yang dijalankan saat logout. Sebelumnya tidak pernah jalan
    // karena effect hanya dievaluasi sekali.
    if (!user && !isPublic) {
      const target = `/login?from=${encodeURIComponent(pathname)}`;
      if (lastAction.current !== target) {
        lastAction.current = target;
        router.replace(target);
      }
      return;
    }

    // Sudah berada di kondisi yang tidak perlu redirect → reset penanda,
    // supaya perpindahan role/sesi berikutnya tetap dievaluasi.
    lastAction.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, isAdmin, pathname]);

  return <>{children}</>;
}
