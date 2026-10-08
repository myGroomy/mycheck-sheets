// lib/api-auth.ts
// Adapter auth untuk API routes: withAuth/requireRole/requireBranchAccess
// dengan bentuk AuthContext yang sama seperti implementasi lama, tetapi
// bersumber dari session HMAC (lib/session.ts) dan registry cabang.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from './session';
import { getCabangList } from './google/registry';

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

export type AuthenticatedHandler = (
  req: NextRequest,
  ctx: AuthContext
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Belum terotentikasi. Sesi tidak ditemukan.' },
        { status: 401 }
      );
    }

    let branchIds: string[] = [];
    if (session.role === 'admin') {
      try {
        const cabangs = await getCabangList();
        branchIds = cabangs.map((c) => c.Cabang_ID);
      } catch {
        branchIds = session.cabangId ? session.cabangId.split(',').map((s) => s.trim()) : [];
      }
    } else {
      branchIds = (session.cabangId || '').split(',').map((s) => s.trim()).filter(Boolean);
    }

    const ctx: AuthContext = {
      user: {
        id: session.username,
        name: session.nama,
        username: session.username,
        role: session.role,
        mustChangePin: false,
        isActive: true,
      },
      branchIds,
      cabangId: session.cabangId,
    };

    return handler(req, ctx);
  };
}

export function requireRole(
  authCtx: AuthContext,
  requiredRole: 'admin' | 'petugas'
): NextResponse | null {
  if (authCtx.user.role !== requiredRole && authCtx.user.role !== 'admin') {
    return NextResponse.json(
      { error: `Akses ditolak. Peran ${requiredRole} diperlukan.` },
      { status: 403 }
    );
  }
  return null;
}

export function requireBranchAccess(
  authCtx: AuthContext,
  branchId: string
): NextResponse | null {
  if (authCtx.user.role === 'admin') return null;
  if (!authCtx.branchIds.includes(branchId)) {
    return NextResponse.json(
      { error: 'Akses ditolak. Anda tidak memiliki akses ke cabang ini.' },
      { status: 403 }
    );
  }
  return null;
}
