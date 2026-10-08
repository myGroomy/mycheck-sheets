import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/session';

// Stateless HMAC session — "logout all" cukup hapus cookie di sisi client.
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
