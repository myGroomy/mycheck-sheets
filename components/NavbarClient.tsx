'use client';

// components/NavbarClient.tsx
// Navigasi global aplikasi dengan tiga mode, semuanya membaca dari
// `lib/nav-config.ts` (satu sumber kebenaran):
//
//   • Desktop (md+): side panel fixed di kiri untuk SEMUA halaman yang
//     login — admin maupun petugas. Tidak lagi ada dropdown "Menu" di header
//     dan tidak ada lagi perbedaan tampilan antara halaman admin dan
//     halaman petugas.
//   • Mobile (<md): bar navigasi bawah dengan maksimal 4 item inti + tombol
//     "Lainnya" (total 5 tombol). Item sisanya dikelompokkan di drawer
//     "Lainnya".
//
// `initialRole` berasal dari server (session cookie) supaya SSR merender item
// yang sesuai role tanpa menunggu fetch /api/auth/me di client. Begitu
// useAuth() ter-resolve, role otomatis memakai data asli.

import React, { useState, useEffect, useRef, useId } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { useCabang } from '@/lib/CabangContext';
import { useWorkingBranch } from '@/lib/working-branch';
import {
  getMobileCoreItems,
  getMobileMoreGroups,
  getNavGroups,
  isNavItemActive,
  isStandalonePath,
} from '@/lib/nav-config';
import type { NavItem, UserRole } from '@/lib/nav-config';
import { LogOut, X, MoreHorizontal, Building2 } from 'lucide-react';

/**
 * Selector "cabang kerja" untuk admin.
 *
 * Admin punya akses ke seluruh cabang, jadi tanpa selector ini tidak ada yang
 * menyatakan cabang mana yang sedang ia kerjakan. Ini bukan simplemente
 * filter tampilan: `POST /api/shifts/open` dan `POST /api/incidents`
 * akan menolak permintaan admin yang tidak menyebut cabang, jadi select ini
 * adalah cara melewati penolakan tersebut.
 *
 * Hanya dirender untuk admin (petugas memakai cabang penugasannya sendiri).
 */
function WorkingBranchPicker({ variant }: { variant: 'sidebar' | 'drawer' }) {
  const { branches, loading } = useCabang();
  const { branchId, setBranchId, isAdmin } = useWorkingBranch();
  const selectId = useId();
  if (!isAdmin) return null;

  return (
    <div className={variant === 'drawer' ? 'px-1 pb-3' : ''}>
      <label
        htmlFor={selectId}
        className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-light"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Cabang kerja
      </label>
      <select
        id={selectId}
        value={branchId ?? ''}
        onChange={(event) => setBranchId(event.target.value)}
        className="min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm font-medium text-ink"
      >
        {loading && !branches.length && <option value="">Memuat…</option>}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NavbarClient({ initialRole }: { initialRole: UserRole }) {
  const pathname = usePathname();
  const { user, logout, loading, transition } = useAuth();
  // Saat SSR, `user` belum ada → pakai initialRole. Setelah hydration, pakai
  // data asli dari AuthContext.
  const role: UserRole = user?.role ?? initialRole;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const navGroups = getNavGroups(role);
  const mobileCoreItems = getMobileCoreItems(role);
  const mobileMoreGroups = getMobileMoreGroups(role);
  const hasMoreItems = mobileMoreGroups.some((g) => g.items.length > 0);

  // Side panel desktop hanya untuk halaman "terlindungi": landing, login,
  // laporan publik, dan docs (punya sidebar sendiri) tetap full-width.
  const standalone = isStandalonePath(pathname);

  const isActive = (item: NavItem) => isNavItemActive(item, pathname);

  // Tutup drawer saat klik di luar.
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  // Tutup drawer "Lainnya" setiap kali pindah halaman.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Sembunyikan nav di halaman publik ketika belum login
  if (!loading && !user && standalone) return null;

  const showSidebar = !standalone;
  // Jumlah kolom bar bawah = jumlah item inti + tombol "Lainnya" (jika ada).
  const bottomColumns = mobileCoreItems.length + (hasMoreItems ? 1 : 0);

  const userBlock = user ? (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden min-w-0 truncate text-xs text-ink-muted sm:inline">
        {user.nama} · {user.role}
      </span>
      <button
        onClick={() => void logout()}
        disabled={transition !== 'idle'}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        title="Keluar"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Keluar</span>
      </button>
    </div>
  ) : null;

  return (
    <>
      {/* Header: brand di kiri, aksi akun di kanan (mobile). Di desktop aksi
          akun pindah ke footer side panel supaya tidak dobel. Paddingnya
          meniru padding konten halaman, dan digeser sebesar lebar side panel
          (`md:pl-64`) supaya brand sejajar dengan judul halaman. */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 backdrop-blur">
        <div className={`flex h-14 w-full items-center ${showSidebar ? 'md:pl-64' : ''}`}>
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 xl:px-10">
            <Link
              href={role === 'admin' ? '/admin' : '/daftar-shift'}
              prefetch={false}
              className="shrink-0 text-sm font-bold tracking-tight text-ink"
            >
              MyCheck
            </Link>
            <div className={showSidebar ? 'md:hidden' : ''}>{userBlock}</div>
          </div>
        </div>
      </header>

      {/* Side panel desktop (semua halaman yang login) */}
      {showSidebar && (
        <aside className="fixed bottom-0 left-0 top-14 z-40 hidden w-64 flex-col border-r border-border bg-surface md:flex">
          <nav aria-label="Navigasi utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
            {navGroups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-light">
                  {group.title}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                          active
                            ? 'bg-canvas font-semibold text-ink'
                            : 'text-ink-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          {user && (
            <div className="border-t border-border px-3 py-3">
              <div className="flex items-center gap-3 px-3 pb-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink">
                  {(user.nama?.charAt(0) ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{user.nama}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {user.role === 'admin' ? 'Administrator' : 'Petugas'}
                  </p>
                </div>
              </div>
              <WorkingBranchPicker variant="sidebar" />
              <button
                onClick={() => void logout()}
                disabled={transition !== 'idle'}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-error transition hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Bar bawah mobile — maksimal 5 tombol */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Navigasi bawah"
      >
        <div
          className="mx-auto grid max-w-lg"
          style={{ gridTemplateColumns: `repeat(${bottomColumns}, minmax(0, 1fr))` }}
        >
          {mobileCoreItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMoreOpen(false)}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-0.5 py-1.5 text-2xs font-medium leading-tight ${
                  active ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="w-full truncate text-center">{item.name}</span>
              </Link>
            );
          })}
          {hasMoreItems && (
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-0.5 py-1.5 text-2xs font-medium leading-tight ${
                moreOpen ? 'text-ink' : 'text-ink-muted'
              }`}
              aria-label={role === 'admin' ? 'Menu admin' : 'Menu lainnya'}
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="w-full truncate text-center">{role === 'admin' ? 'Admin' : 'Lainnya'}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Drawer "Lainnya" (mobile) — item sisanya dikelompokkan */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={moreRef}
            role="dialog"
            aria-modal="true"
            aria-label={role === 'admin' ? 'Menu admin' : 'Menu lainnya'}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 pb-3 pt-4">
              <span className="text-sm font-bold text-ink">{role === 'admin' ? 'Menu Admin' : 'Lainnya'}</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="-mr-2 p-2 text-ink-muted hover:text-ink"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-3 pb-4">
              {mobileMoreGroups.map((group) => (
                <section key={group.title} className="pb-4">
                  <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-light">
                    {group.title}
                  </h2>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                          active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </section>
              ))}
              <section>
                <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-light">
                  Akun
                </h2>
                <WorkingBranchPicker variant="drawer" />
                <button
                  onClick={() => { setMoreOpen(false); void logout(); }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-error transition hover:bg-error-bg"
                >
                  <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>Keluar</span>
                </button>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}