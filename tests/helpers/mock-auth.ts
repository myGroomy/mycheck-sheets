// tests/helpers/mock-auth.ts
// Membuat AuthContext dan request tiruan untuk memanggil route handler admin
// secara langsung, tanpa HTTP server dan tanpa session cookie sungguhan.
//
// `withAuth` membaca session dari request lewat `getSessionFromRequest`
// (lib/session.ts). Supaya tidak perlu menandatangani token HMAC, helper ini
// menaruh stub `getSessionFromRequest` di require.cache `lib/session` —
// dengan begitu route handler yang diuji tetap melewati seluruh jalur withAuth,
// hanya sumber sesinya yang diganti.

import { createRequire } from 'node:module';
import type { NextRequest } from 'next/server';
import type { AuthContext } from '../../lib/api-auth';

const require = createRequire(__filename);

const SESSION_MODULE = require.resolve('../../lib/session');

let currentSession: {
  username: string;
  nama: string;
  role: 'admin' | 'petugas';
  cabangId: string;
  userId?: string;
  requiresSetup?: boolean;
} | null = null;

/** Pasang stub session SEBELUM route handler di-import. */
export function installSessionStub(): void {
  require.cache[SESSION_MODULE] = {
    id: SESSION_MODULE,
    filename: SESSION_MODULE,
    loaded: true,
    children: [],
    paths: [],
    exports: {
      getSessionFromRequest: (_req: NextRequest) => currentSession,
      createSessionToken: () => '',
      verifySessionToken: () => null,
      setSessionCookieHeader: () => '',
      clearSessionCookieHeader: () => '',
      SESSION_COOKIE: 'mycheck_session',
    },
  } as unknown as NodeModule;
}

/** Set session yang akan dipakai handler berikutnya. */
export function setSession(session: {
  username: string;
  nama: string;
  role: 'admin' | 'petugas';
  cabangId: string;
  userId?: string;
  requiresSetup?: boolean;
}): void {
  currentSession = session;
}

export function clearSession(): void {
  currentSession = null;
}

/** AuthContext admin yang mengakses seluruh cabang pada ctx.branchIds. */
export function adminContext(branchIds: string[] = ['CAB1']): AuthContext {
  return {
    user: {
      id: 'admin1',
      name: 'Admin Uji',
      username: 'admin1',
      role: 'admin',
      isActive: true,
    },
    branchIds,
    cabangId: branchIds.join(','),
  };
}

/** AuthContext petugas dengan akses cabang terbatas. */
export function petugasContext(branchIds: string[] = ['CAB1']): AuthContext {
  return {
    user: {
      id: 'petugas1',
      name: 'Petugas Uji',
      username: 'petugas1',
      role: 'petugas',
      isActive: true,
    },
    branchIds,
    cabangId: branchIds.join(','),
  };
}

/** Request tiruan yang cukup untuk handler: URL + method + body opsional. */
export function makeRequest(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  const init: RequestInit & { headers: Headers } = {
    method,
    headers: new Headers({ 'X-Requested-With': 'fetch' }),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers.set('Content-Type', 'application/json');
  }
  return new Request(url, init) as unknown as NextRequest;
}

/** ID dari pathname, untuk route berparameter. */
export function idFromUrl(url: string): string {
  return new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
}
