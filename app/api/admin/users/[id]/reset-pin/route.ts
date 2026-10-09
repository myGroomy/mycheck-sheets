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

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  // /api/admin/users/[id]/reset-pin -> id berada di index length - 2
  const targetUserId = pathParts[pathParts.length - 2];

  let body: unknown;
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const parseResult = sensitiveActionSchema
    .extend({ newPin: sensitiveActionSchema.shape.pin })
    .safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { pin: adminPin, newPin } = parseResult.data;

  const pinErr = await verifyAdminPin(ctx.user.id, adminPin);
  if (pinErr) {
    return NextResponse.json({ error: pinErr }, { status: 403 });
  }

  const existing = (await listAllUsers()).find((u) => u.User_ID === targetUserId);
  if (!existing) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  const rows = await listRowsWithNumber(getRegistrySpreadsheetId(), USERS_SHEET);
  const rowNumber = rows.find((r) => String(r.data['User_ID'] ?? '') === targetUserId)?.rowNumber;
  if (rowNumber == null) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  await updateUserCells(rowNumber, {
    PIN: newPin,
    Must_Change_Pin: true,
  });

  return NextResponse.json({ message: 'PIN berhasil direset. User wajib mengganti PIN saat login.' });
});