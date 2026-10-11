'use client';

// components/NavbarClient.tsx
// Isi Navbar. `initialRole` berasal dari server (session cookie) supaya SSR
// merender item yang sesuai role tanpa menunggu fetch /api/auth/me di
// client. Begitu useAuth() ter-resolve, role otomatis memakai data asli.

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import {
  ClipboardCheck,
  Activity,
  Users,
  Building2,
  FileText,
  LayoutDashboard,
  ListChecks,
  AlertTriangle,
  Settings,
  LogOut,
  X,
  BookOpen,
  MoreHorizontal,
  Menu,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type UserRole = 'admin' | 'petugas';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

// Item inti petugas (muncul di bar bawah HP, dan di header tablet/desktop).
const PETUGAS_CORE: NavItem[] = [
  { name: 'Checklist', href: '/daftar-shift', icon: ClipboardCheck },
  { name: 'Incident', href: '/incident', icon: AlertTriangle },
  { name: 'Laporan', href: '/report', icon: FileText },
];

// Item inti admin.
const ADMIN_CORE: NavItem[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Operasi', href: '/admin/operasi-shift', icon: Activity },
  { name: 'Incident', href: '/admin/incident', icon: AlertTriangle },
  { name: 'Laporan', href: '/admin/laporan', icon: FileText },
];

const ADMIN_SIDEBAR_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operasional',
    items: [
      { name: 'Operasi Shift', href: '/admin/operasi-shift', icon: Activity },
      { name: 'Incident', href: '/admin/incident', icon: AlertTriangle },
    ],
  },
  {
    title: 'Laporan',
    items: [{ name: 'Laporan', href: '/admin/laporan', icon: FileText }],
  },
  {
    title: 'Konfigurasi',
    items: [
      { name: 'Cabang', href: '/admin/cabang', icon: Building2 },
      { name: 'Shift', href: '/admin/shift', icon: ClipboardCheck },
      { name: 'Checklist / SOP', href: '/admin/checklist-builder', icon: ListChecks },
      { name: 'Handover', href: '/admin/handover-builder', icon: FileText },
    ],
  },
  {
    title: 'Administrasi',
    items: [
      { name: 'Akun', href: '/admin/akun', icon: Users },
      { name: 'Pengaturan', href: '/admin/pengaturan', icon: Settings },
      { name: 'Audit Log', href: '/admin/audit-log', icon: Activity },
    ],
  },
];

const ADMIN_MOBILE_CORE: NavItem[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Operasi', href: '/admin/operasi-shift', icon: Activity },
  { name: 'Incident', href: '/admin/incident', icon: AlertTriangle },
  { name: 'Laporan', href: '/admin/laporan', icon: FileText },
];

const ADMIN_MOBILE_GROUPS = ADMIN_SIDEBAR_GROUPS.slice(2);

// Tautan tambahan untuk halaman non-admin yang tetap dapat dibuka oleh admin.
const ADMIN_MORE: NavItem[] = [
  { name: 'Akun', href: '/admin/akun', icon: Users },
  { name: 'Cabang', href: '/admin/cabang', icon: Building2 },
  { name: 'Shift', href: '/admin/shift', icon: ClipboardCheck },
  { name: 'Checklist / SOP', href: '/admin/checklist-builder', icon: ListChecks },
  { name: 'Handover', href: '/admin/handover-builder', icon: FileText },
  { name: 'Kategori Incident', href: '/admin/kategori-incident', icon: AlertTriangle },
  { name: 'Pengaturan', href: '/admin/pengaturan', icon: Settings },
  { name: 'Audit Log', href: '/admin/audit-log', icon: Activity },
];

const PETUGAS_MORE: NavItem[] = [
  { name: 'Panduan', href: '/docs', icon: BookOpen },
  { name: 'Ganti PIN', href: '/ganti-pin', icon: Settings },
];

function isVisible(item: NavItem, role: UserRole) {
  return !item.roles || item.roles.includes(role);
}

export function NavbarClient({ initialRole }: { initialRole: UserRole }) {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  // Saat SSR, `user` belum ada → pakai initialRole. Setelah hydration, pakai
  // data asli dari AuthContext.
  const role: UserRole = user?.role ?? initialRole;

  const [moreOpen, setMoreOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const isAdminArea = role === 'admin' && pathname.startsWith('/admin');
  const coreItems = (isAdminArea
    ? ADMIN_MOBILE_CORE
    : role === 'admin'
      ? ADMIN_CORE
      : PETUGAS_CORE
  ).filter((i) => isVisible(i, role));
  const moreItems = (role === 'admin' ? ADMIN_MORE : PETUGAS_MORE).filter((i) => isVisible(i, role));
  const showAdminMenu = role === 'admin' && !isAdminArea;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/daftar-shift') return pathname === '/daftar-shift' || pathname.startsWith('/shift/');
    if (href === '/admin') return pathname === '/admin';
    if (href === '/admin/incident') {
      return pathname === href || pathname.startsWith(`${href}/`) || pathname === '/admin/kategori-incident';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Tutup menu saat klik di luar.
  useEffect(() => {
    if (!moreOpen && !adminMenuOpen && !desktopMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) setAdminMenuOpen(false);
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(e.target as Node)) setDesktopMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen, adminMenuOpen, desktopMenuOpen]);

  // Sembunyikan nav di halaman publik ketika belum login
  const publicPages = ['/', '/login'];
  const isPublicPage = publicPages.includes(pathname) || pathname.startsWith('/docs') || pathname.startsWith('/r/');
  if (!loading && !user && isPublicPage) return null;

  return (
    <>
      {/* Header desktop */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link
            href={isAdminArea ? '/admin' : '/'}
            prefetch={false}
            className="text-sm font-bold tracking-tight text-ink"
          >
            MyCheck
          </Link>

          {!isAdminArea && (
            <div ref={desktopMenuRef} className="relative">
              <button
                onClick={() => setDesktopMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-canvas hover:text-ink"
                aria-expanded={desktopMenuOpen}
                aria-label="Menu navigasi"
              >
                {desktopMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                <span className="hidden sm:inline">Menu</span>
              </button>
              {desktopMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-surface py-1 shadow-lg">
                  {coreItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setDesktopMenuOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition ${
                          active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                  <div className="my-1 border-t border-border" />
                  {moreItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setDesktopMenuOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition ${
                          active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sisi kanan */}
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden text-xs text-ink-muted sm:inline">
                {user.nama} · {user.role}
              </span>
            )}
            {user && (
              <button
                onClick={logout}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-canvas hover:text-ink"
                title="Keluar"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {isAdminArea && (
        <aside className="fixed bottom-0 left-0 top-14 z-40 hidden w-64 overflow-y-auto border-r border-border bg-surface px-3 py-5 md:block">
          <nav aria-label="Navigasi admin" className="space-y-5">
            <Link
              href="/admin"
              aria-current={isActive('/admin') ? 'page' : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                isActive('/admin') ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </Link>
            {ADMIN_SIDEBAR_GROUPS.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h2 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-light">
                  {group.title}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                          active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
            <Link
              href="/docs"
              prefetch={false}
              className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-muted transition hover:bg-canvas hover:text-ink"
            >
              <BookOpen className="h-4 w-4" />
              <span>Panduan</span>
            </Link>
          </nav>
        </aside>
      )}

      {/* Bar bawah HP */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur md:hidden" aria-label="Navigasi bawah">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {coreItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMoreOpen(false)}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
                  active ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
              moreOpen ? 'text-ink' : 'text-ink-muted'
            }`}
            aria-label="Menu lainnya"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Lainnya</span>
          </button>
        </div>
      </nav>

      {/* Drawer Lainnya (HP) */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            ref={moreRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu lainnya"
            className="fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <span className="text-sm font-bold text-ink">Lainnya</span>
              <button onClick={() => setMoreOpen(false)} className="-mr-2 p-2 text-ink-muted hover:text-ink" aria-label="Tutup menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-3 pb-4">
              {role === 'admin' && isAdminArea ? ADMIN_MOBILE_GROUPS.map((group) => (
                <section key={group.title} className="pb-4">
                  <h2 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-light">
                    {group.title}
                  </h2>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition ${
                          active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </section>
              )) : moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                      active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-error transition hover:bg-error-bg"
              >
                <LogOut className="h-5 w-5" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}