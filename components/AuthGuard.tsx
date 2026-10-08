'use client';

// components/AuthGuard.tsx
// Adaptasi pola STOKIS. Perbedaan penting dari versi STOKIS: MYCHECK memakai
// server-side auth (requireUser/requireAdmin di layout server component), jadi
// AuthGuard ini TIDAK mem-block render dengan spinner — semua halaman sudah
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
  const checked = useRef(false);

  useEffect(() => {
    if (loading || checked.current) return;
    checked.current = true;

    // Sudah login tapi masih di /login → tujuan sesuai role
    if (pathname === '/login' && user) {
      router.replace(user.role === 'admin' ? '/admin' : '/');
      return;
    }

    // Non-admin membuka area admin
    if (user && !isAdmin && pathname.startsWith('/admin')) {
      router.replace('/');
      return;
    }

    const isPublic =
      pathname === '/' ||
      pathname === '/login' ||
      pathname.startsWith('/docs') ||
      pathname.startsWith('/r/');

    // Belum login, bukan route publik → ke /login
    if (!user && !isPublic) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, isAdmin, pathname]);

  return <>{children}</>;
}