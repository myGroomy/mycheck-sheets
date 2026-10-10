// lib/page-auth.ts
// Auth untuk Server Component (page). Cermin dari `lib/api-auth.ts` yang
// dipakai API route, tapi membaca cookie lewat `cookies()` dari next/headers.
//
// Bentuk AuthContext sengaja sama dengan versi lama supaya halaman yang
// sudah ada tidak perlu banyak diubah.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from './session';
import { getCabangList } from './google/registry';

// Nama cookie harus sama dengan yang dipakai lib/session.ts
const COOKIE_NAME = 'mycheck_session';

export interface AuthContext {
  user: {
    id: string;
    name: string;
    username: string;
    role: 'admin' | 'petugas';
    mustChangePin: boolean;
    isActive: boolean;
  };
  branchIds: string[];
  cabangId: string;
}

/** Daftar cabang yang boleh diakses user. Admin → seluruh cabang aktif. */
async function resolveBranchIds(
  role: 'admin' | 'petugas',
  cabangId: string
): Promise<string[]> {
  if (role === 'admin') {
    try {
      const cabangs = await getCabangList();
      return cabangs.map((c) => c.Cabang_ID);
    } catch {
      return cabangId ? cabangId.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }
  }
  return cabangId
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function buildContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  return {
    user: {
      id: session.username,
      name: session.nama,
      username: session.username,
      role: session.role,
      mustChangePin: false,
      isActive: true,
    },
    branchIds: await resolveBranchIds(session.role, session.cabangId),
    cabangId: session.cabangId,
  };
}

/** Sesi wajib ada; kalau tidak, redirect ke /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await buildContext();
  if (!ctx) redirect('/login');
  return ctx;
}

/** Sesi wajib ada dan berperan admin. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.user.role !== 'admin') redirect('/');
  return ctx;
}

/** Sesi opsional return null bila tidak login (tanpa redirect). */
export async function getUser(): Promise<AuthContext | null> {
  return buildContext();
}