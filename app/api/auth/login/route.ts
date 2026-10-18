import { NextRequest, NextResponse } from 'next/server';
import { readSheetDataFresh, sheetToObjects } from '@/lib/google/sheets';
import { createSessionToken, setSessionCookieHeader } from '@/lib/session';

export async function POST(_req: NextRequest) {
  try {
    const body = await _req.json();
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
      v === true || v === 'true' || v === 'TRUE' || v === 'True' || v === 'yes' || v === 'YES' || v === 'Yes' || v === 'ya' || v === 'YA' || v === '1' || v === 1;

    if (!user) {
      return NextResponse.json(
        { error: 'Username tidak ditemukan', code: 'USER_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Normalisasi kedua sisi sebelum membandingkan (trim + String) supaya
    // selisih tipenya (number/string) di Google Sheets tidak menyebabkan
    // PIN ditolak. PERHATIAN keamanan: PIN masih disimpan plaintext di sheet
    // registry untuk kompatibilitas dengan STOKIS. Bukan rekomendasi jangka
    // panjang — lindungi dengan force-change setelah login pertama / atau
    // hash sesudah infrastruktur autentikasi lama dipindahkan.
    const storedPin = String(user['PIN'] ?? '').trim();
    const inputPin = pin.trim();
    if (storedPin !== inputPin) {
      return NextResponse.json(
        { error: 'PIN yang Anda masukkan salah', code: 'WRONG_PIN' },
        { status: 401 }
      );
    }

    if (!isAktif(user['Aktif'])) {
      return NextResponse.json(
        { error: 'Akun Anda nonaktif. Hubungi Admin.', code: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    const role = String(user['Role'] ?? 'petugas').toLowerCase() === 'admin' ? 'admin' : 'petugas';
    const requiresSetup = ['true', 'TRUE', '1', 'yes', 'YES', 'ya', 'YA'].includes(
      String(user['Must_Change_Pin'] ?? '').trim()
    );

    const token = createSessionToken({
      username: String(user['Username']),
      nama: String(user['Nama'] ?? ''),
      role,
      cabangId: String(user['Cabang_ID'] ?? ''),
      userId: String(user['User_ID'] ?? ''),
      requiresSetup,
    });

    const response = NextResponse.json({
      user: { username: user['Username'], nama: user['Nama'], role, cabangId: user['Cabang_ID'] },
      requiresSetup,
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
