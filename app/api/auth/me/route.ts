import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: { message: 'Belum login' } },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: {
      username: session.username,
      nama: session.nama,
      role: session.role,
      cabangId: session.cabangId,
    },
  });
}
