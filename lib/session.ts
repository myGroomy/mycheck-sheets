// lib/session.ts
// Session management via httpOnly cookies (server-side only)
// Uses HMAC-SHA256 signed tokens for tamper-proof sessions

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';

const SESSION_SECRET = getEnv().STOKIS_API_KEY;
const COOKIE_NAME = 'mycheck_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface SessionData {
  username: string;
  nama: string;
  role: 'admin' | 'petugas';
  cabangId: string;
  exp: number;
}

/**
 * Create a signed session token (HMAC-SHA256)
 */
export function createSessionToken(data: Omit<SessionData, 'exp'>): string {
  const payload: SessionData = {
    ...data,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

/**
 * Verify and decode a session token.
 * Returns null if invalid or expired.
 */
export function verifySessionToken(token: string): SessionData | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  // Constant-time comparison
  if (signature.length !== expectedSignature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const payload: SessionData = JSON.parse(
      Buffer.from(encoded, 'base64url').toString()
    );
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Read session from request cookies (server-side)
 */
export function getSessionFromRequest(request: NextRequest): SessionData | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Set-Cookie header for login
 */
export function setSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    // Secure flag only in production (HTTPS) environments
    ...(isProd ? ['Secure'] : []),
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE}`,
  ].join('; ');
}

/**
 * Set-Cookie header for logout (clear)
 */
export function clearSessionCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
  ].join('; ');
}
