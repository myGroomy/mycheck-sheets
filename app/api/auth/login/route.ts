import { NextRequest, NextResponse } from 'next/server';
import { readSheetDataFresh, sheetToObjects } from '@/lib/google/sheets';
import { createSessionToken, setSessionCookieHeader } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? '').trim();
    const pin = String(body?.pin ?? '').trim();

    if (!username || !pin) {
      return NextResponse.json(
        { error: 'Username dan PIN wajib diisi' },
        { status: 400 }
      );
    }

    const registryId = process.env.REGISTRY_SPREADSHEET_ID;
    if (!registryId) {
      return NextResponse.json(
        { error: 'REGISTRY_SPREADSHEET_ID belum dikonfigurasi' },
        { status: 500 }
      );
    }

    const { headers, rows } = await readSheetDataFresh(registryId, 'Users');
    const users = sheetToObjects(headers, rows) as Record<string, string>[];

    const user = users.find(
      (u) => String(u['Username'] ?? '').trim().toLowerCase() === username.toLowerCase()
    );

    const isAktif = (v: unknown) =>
      v === true || v === 'true' || v === 'TRUE' || v === 'True' || v === '1' || v === 1;

    if (!user || String(user['PIN'] ?? '') !== pin) {
      return NextResponse.json(
        { error: 'Username atau PIN salah' },
        { status: 401 }
      );
    }

    if (!isAktif(user['Aktif'])) {
      return NextResponse.json(
        { error: 'Akun Anda nonaktif. Hubungi Admin.' },
        { status: 403 }
      );
    }

    const role = String(user['Role'] ?? 'petugas').toLowerCase() === 'admin' ? 'admin' : 'petugas';
    const mustChangePin =
      String(user['Must_Change_Pin'] ?? '').toLowerCase() === 'true';

    const token = createSessionToken({
      username: String(user['Username']),
      nama: String(user['Nama'] ?? ''),
      role,
      cabangId: String(user['Cabang_ID'] ?? ''),
    });

    const response = NextResponse.json({
      user: { username: user['Username'], nama: user['Nama'], role, cabangId: user['Cabang_ID'], mustChangePin },
    });
    response.headers.set('Set-Cookie', setSessionCookieHeader(token));
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Gagal memproses login: ' + message },
      { status: 500 }
    );
  }
}
