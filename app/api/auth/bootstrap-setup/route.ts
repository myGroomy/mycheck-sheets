import { NextRequest, NextResponse } from 'next/server';
import { bootstrapSetupSchema } from '@/lib/shared';
import { getSessionFromRequest, createSessionToken, setSessionCookieHeader } from '@/lib/session';
import { getRegistrySpreadsheetId } from '@/lib/google/registry';
import { readSheetDataFresh, sheetToObjects } from '@/lib/google/sheets';
import { listRowsWithNumberFresh } from '@/lib/store';
import { updateUserCells, USERS_SHEET, resetUsersCache, type UserRow } from '@/lib/google/registry-admin';

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Belum login.' }, { status: 401 });
  }
  if (!session.requiresSetup) {
    return NextResponse.json({ error: 'Setup bootstrap tidak diperlukan.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON.' }, { status: 400 });
  }
  const parsed = bootstrapSetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid.', details: parsed.error.flatten() }, { status: 400 });
  }

  const registryId = getRegistrySpreadsheetId();
  const { headers, rows } = await readSheetDataFresh(registryId, USERS_SHEET);
  const users = sheetToObjects(headers, rows) as UserRow[];
  const target = users.find((user) =>
    session.userId
      ? String(user.User_ID ?? '') === session.userId
      : String(user.Username ?? '').trim().toLowerCase() === session.username.toLowerCase()
  );
  if (!target) return NextResponse.json({ error: 'Akun bootstrap tidak ditemukan.' }, { status: 404 });
  if (String(target.Role ?? '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Setup bootstrap hanya berlaku untuk admin.' }, { status: 403 });
  }

  const duplicate = users.some((user) =>
    user.User_ID !== target.User_ID &&
    String(user.Username ?? '').trim().toLowerCase() === parsed.data.username.toLowerCase()
  );
  if (duplicate) return NextResponse.json({ error: `Username '${parsed.data.username}' sudah digunakan.` }, { status: 400 });

  const numbered = await listRowsWithNumberFresh(registryId, USERS_SHEET);
  const row = numbered.find((item) => String(item.data.User_ID ?? '') === target.User_ID);
  if (!row) return NextResponse.json({ error: 'Baris akun bootstrap tidak ditemukan.' }, { status: 404 });

  await updateUserCells(row.rowNumber, {
    Username: parsed.data.username,
    PIN: parsed.data.newPin,
    Must_Change_Pin: false,
  });
  resetUsersCache();

  const token = createSessionToken({
    username: parsed.data.username,
    nama: target.Nama,
    role: 'admin',
    cabangId: target.Cabang_ID,
    userId: target.User_ID,
    requiresSetup: false,
  });
  const response = NextResponse.json({
    user: {
      username: parsed.data.username,
      nama: target.Nama,
      role: 'admin',
      cabangId: target.Cabang_ID,
    },
    requiresSetup: false,
  });
  response.headers.set('Set-Cookie', setSessionCookieHeader(token));
  return response;
}
