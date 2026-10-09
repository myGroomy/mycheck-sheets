import { NextResponse } from 'next/server';
import { sensitiveActionSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { verifyAdminPin } from '../../../../../../lib/admin/sensitive-action';
import {
  listAllUsers,
  updateUserCells,
  USERS_SHEET,
} from '../../../../../../lib/google/registry-admin';
import { getRegistrySpreadsheetId } from '../../../../../../lib/google/registry';
import { listRowsWithNumber } from '../../../../../../lib/store';

/**
 * Paksa logout user dari semua perangkat.
 * Versi Sheets memakai session cookie stateless (HMAC), jadi sesi tidak
 * disimpan di server dan tidak bisa dicabut per-user. Untuk memaksa user
 * keluar, nonaktifkan akunnya.
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
  if (existing.User_ID === ctx.user.id) {
    return NextResponse.json(
      { error: 'Tidak bisa memaksa logout akun Anda sendiri.' },
      { status: 400 }
    );
  }

  const rows = await listRowsWithNumber(getRegistrySpreadsheetId(), USERS_SHEET);
  const rowNumber = rows.find((r) => String(r.data['User_ID'] ?? '') === targetUserId)?.rowNumber;
  if (rowNumber == null) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  await updateUserCells(rowNumber, { Aktif: false });

  return NextResponse.json({
    message:
      'Sesi bersifat stateless sehingga tidak bisa dicabut per-user. Akun dinonaktifkan sebagai gantinya.',
  });
});