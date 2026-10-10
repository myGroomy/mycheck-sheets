import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Path publik yang tidak memerlukan autentikasi
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/health',
  '/api/public',
  '/r',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icons',
];

// Next.js 16: konvensi `middleware` diganti nama menjadi `proxy`
// (lihat https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
// Logika tidak berubah — hanya nama file & fungsi.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === '/' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (isPublic) {
    return NextResponse.next();
  }

  // Path terproteksi: cek keberadaan session cookie.
  // Verifikasi HMAC dilakukan di API routes / server components via withAuth/getSessionFromRequest.
  const token = req.cookies.get('mycheck_session')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Belum login' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
