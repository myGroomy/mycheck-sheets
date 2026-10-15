// lib/nav-config.ts
// SATU sumber kebenaran untuk navigasi aplikasi.
//
// Sebelumnya tiap mode (sidebar desktop / dropdown header / bar bawah HP)
// punya daftar item sendiri di `components/NavbarClient.tsx`, sehingga
// desktop dan mobile menampilkan menu yang berbeda. Sekarang semua mode baca
// dari struktur grup di bawah, jadi desktop dan mobile dijamin konsisten.

import {
  Activity,
  AlertTriangle,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type UserRole = 'admin' | 'petugas';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Fallback route saat item ini yang sedang aktif (mis. sub-tab). */
  aliases?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Batas tombol pada bar navigasi bawah (mobile).
 * 4 item + tombol "Lainnya" = 5 tombol, sesuai requirement "maksimal 5".
 */
export const MOBILE_CORE_LIMIT = 4;

const ADMIN_NAV: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Operasi Shift', href: '/admin/operasi-shift', icon: Activity },
      { name: 'Incident', href: '/admin/incident', icon: AlertTriangle, aliases: ['/admin/kategori-incident'] },
      { name: 'Laporan', href: '/admin/laporan', icon: FileText },
    ],
  },
  {
    title: 'Konfigurasi',
    items: [
      { name: 'Cabang', href: '/admin/cabang', icon: Building2 },
      { name: 'Shift', href: '/admin/shift', icon: ClipboardCheck },
      { name: 'Checklist / SOP', href: '/admin/checklist-builder', icon: ListChecks },
      // Handover menyatukan riwayat + builder dalam satu halaman (tab).
      { name: 'Handover', href: '/admin/handover', icon: FileText, aliases: ['/admin/handover-builder'] },
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
  {
    title: 'Bantuan',
    items: [
      { name: 'Panduan', href: '/docs', icon: BookOpen },
      { name: 'Ganti PIN', href: '/ganti-pin', icon: Settings },
    ],
  },
];

const PETUGAS_NAV: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      { name: 'Checklist', href: '/daftar-shift', icon: ClipboardCheck, aliases: ['/shift'] },
      { name: 'Handover', href: '/handover', icon: FileText },
      { name: 'Incident', href: '/incident', icon: AlertTriangle },
      { name: 'Laporan', href: '/report', icon: FileText },
    ],
  },
  {
    title: 'Bantuan',
    items: [
      { name: 'Panduan', href: '/docs', icon: BookOpen },
      { name: 'Ganti PIN', href: '/ganti-pin', icon: Settings },
    ],
  },
];

export function getNavGroups(role: UserRole): NavGroup[] {
  return role === 'admin' ? ADMIN_NAV : PETUGAS_NAV;
}

/** Item inti yang selalu tampil langsung di bar bawah (mobile). */
export function getMobileCoreItems(role: UserRole): NavItem[] {
  return getNavGroups(role)[0].items.slice(0, MOBILE_CORE_LIMIT);
}

/** Grup sisanya → dipindah ke drawer "Lainnya". */
export function getMobileMoreGroups(role: UserRole): NavGroup[] {
  const groups = getNavGroups(role);
  const coreHrefs = new Set(getMobileCoreItems(role).map((i) => i.href));
  const rest = groups
    .slice(1)
    .map((g) => ({ ...g, items: g.items.filter((i) => !coreHrefs.has(i.href)) }))
    .filter((g) => g.items.length > 0);
  return rest;
}

/**
 * Halaman yang berdiri sendiri (nav disembunyikan / tidak memakai side panel):
 * landing, login, halaman publik laporan, dan docs (punya sidebar sendiri
 * dari Fumadocs).
 */
export function isStandalonePath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/r/')
  );
}

/** Cek apakah sebuah item sedang aktif untuk `pathname` tertentu. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const targets = [item.href, ...(item.aliases ?? [])];
  return targets.some((href) => pathname === href || pathname.startsWith(href + '/'));
}