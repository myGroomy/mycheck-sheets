import { NextResponse } from 'next/server';
import { sensitiveActionSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { verifyAdminPin } from '../../../../../../lib/admin/sensitive-action';
import { listAllUsers } from '../../../../../../lib/google/registry-admin';

/**
 * Buka kunci akun.
 * Catatan: versi Google Sheets tidak menyimpan lockout (rate limiting & tabel
 * pin_fail_attempts dihapus), jadi endpoint ini hanya mengembalikan success
 * agar frontend lama tidak error mengaktifkan akun nonaktif bila perlu.
 */
export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const targetUserId = pathParts[pathParts.length - 2];

  let body: unknown;
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const parseResult = sensitiveActionSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const pinErr = await verifyAdminPin(ctx.user.id, parseResult.data.pin);
  if (pinErr) {
    return NextResponse.json({ error: pinErr }, { status: 403 });
  }

  const existing = (await listAllUsers()).find((u) => u.User_ID === targetUserId);
  if (!existing) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json({
    message: 'Tidak ada lockout pada versi ini akun tidak pernah terkunci otomatis.',
  });
});