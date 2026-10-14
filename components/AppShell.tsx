'use client';

// components/AppShell.tsx
// Membungkus navigasi + konten halaman.
//
// Side panel desktop (fixed, lebar 16rem) berada di dalam `<NavbarClient />`
// yang dirender di root layout sebagai saudara `<PageTransition>`. Karena itu
// konten perlu digeser sebesar lebar side panel — dulannya ini hanya dilakukan
// di `app/admin/layout.tsx`, sehingga halaman petugas tetap tertimpa di
// belakang side panel. Sekarang offset ini dipakai di sini supaya berlaku
// seragam untuk semua halaman yang login.
//
// Halaman "berdiri sendiri" (landing, login, laporan publik, docs) tetap
// full-width karena memang tidak memakai side panel.

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NavbarClient } from '@/components/NavbarClient';
import { isStandalonePath } from '@/lib/nav-config';
import type { UserRole } from '@/lib/nav-config';

export function AppShell({
  initialRole,
  children,
}: {
  initialRole: UserRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const needsOffset = !isStandalonePath(pathname);

  return (
    <>
      <NavbarClient initialRole={initialRole} />
      <div className={needsOffset ? 'md:pl-64' : undefined}>{children}</div>
    </>
  );
}