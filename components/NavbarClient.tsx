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
  Menu,
  X,
  BookOpen,
  MoreHorizontal,
  ChevronDown,
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
  { name: 'Dasbor', href: '/admin', icon: LayoutDashboard },
  { name: 'Cabang', href: '/admin/cabang', icon: Building2 },
  { name: 'Operasi', href: '/admin/operasi-shift', icon: Activity },
  { name: 'Incident', href: '/admin/incident', icon: AlertTriangle },
];

// Modul admin tambahan: dropdown "Pengelolaan" di desktop, drawer di HP.
const ADMIN_MORE: NavItem[] = [
  { name: 'Akun', href: '/admin/akun', icon: Users },
  { name: 'Shift', href: '/admin/shift', icon: ClipboardCheck },
  { name: 'Checklist Builder', href: '/admin/checklist-builder', icon: ListChecks },
  { name: 'Handover Builder', href: '/admin/handover-builder', icon: FileText },
  { name: 'Kategori Incident', href: '/admin/kategori-incident', icon: AlertTriangle },
  { name: 'Laporan', href: '/admin/laporan', icon: FileText },
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
  const role: UserRole = user?.role === 'admin' ? 'admin' : initialRole;

  const [moreOpen, setMoreOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  const coreItems = (role === 'admin' ? ADMIN_CORE : PETUGAS_CORE).filter((i) => isVisible(i, role));
  const moreItems = (role === 'admin' ? ADMIN_MORE : PETUGAS_MORE).filter((i) => isVisible(i, role));
  const showAdminMenu = role === 'admin';

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/daftar-shift') return pathname === '/daftar-shift' || pathname.startsWith('/shift/');
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isAdminMoreActive = ADMIN_MORE.some((i) => isActive(i.href));

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    if (!moreOpen && !adminMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) setAdminMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen, adminMenuOpen]);

  // Sembunyikan nav di halaman publik ketika belum login
  const publicPages = ['/', '/login'];
  const isPublicPage = publicPages.includes(pathname) || pathname.startsWith('/docs') || pathname.startsWith('/r/');
  if (!loading && !user && isPublicPage) return null;

  return (
    <>
      {/* Header desktop */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" prefetch={false} className="text-sm font-bold tracking-tight text-ink">
            MyCheck
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Navigasi utama">
            {coreItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    active ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            {showAdminMenu && (
              <div ref={adminMenuRef} className="relative">
                <button
                  onClick={() => setAdminMenuOpen((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    adminMenuOpen || isAdminMoreActive ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                  }`}
                  aria-expanded={adminMenuOpen}
                >
                  {adminMenuOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
                  <span>Pengelolaan</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {adminMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-surface py-1 shadow-lg">
                    {ADMIN_MORE.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={false}
                          onClick={() => setAdminMenuOpen(false)}
                          className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition ${
                            active ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                    <Link
                      href="/docs"
                      prefetch={false}
                      onClick={() => setAdminMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-ink-muted transition hover:bg-canvas hover:text-ink"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>Panduan</span>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </nav>

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
            className="fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <span className="text-sm font-bold text-ink">Lainnya</span>
              <button onClick={() => setMoreOpen(false)} className="-mr-2 p-2 text-ink-muted hover:text-ink" aria-label="Tutup menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-3 pb-4">
              {moreItems.map((item) => {
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