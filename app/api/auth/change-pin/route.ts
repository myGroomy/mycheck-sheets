import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { resetUsersCache } from '@/lib/google/registry-admin';
import {
  readSheetData,
  sheetToObjects,
  writeRow,
  columnIndexToLetter,
} from '@/lib/google/sheets';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const oldPin = String(body?.oldPin ?? '').trim();
    const newPin = String(body?.newPin ?? '').trim();

    if (!oldPin || !newPin) {
      return NextResponse.json({ error: 'PIN lama dan PIN baru wajib diisi' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json({ error: 'PIN baru harus 6 digit angka' }, { status: 400 });
    }

    const registryId = process.env.REGISTRY_SPREADSHEET_ID;
    if (!registryId) {
      return NextResponse.json({ error: 'REGISTRY_SPREADSHEET_ID belum dikonfigurasi' }, { status: 500 });
    }

    const { headers, rows } = await readSheetData(registryId, 'Users');
    const users = sheetToObjects(headers, rows) as Record<string, string>[];
    const idx = users.findIndex(
      (u) =>
        String(u['Username'] ?? '').trim().toLowerCase() ===
        ctx.user.username.toLowerCase()
    );
    if (idx === -1) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    const user = users[idx];
    if (String(user['PIN'] ?? '') !== oldPin) {
      return NextResponse.json({ error: 'PIN lama salah' }, { status: 400 });
    }

    const pinCol = headers.indexOf('PIN');
    const mustChangeCol = headers.indexOf('Must_Change_Pin');
    const rowNumber = idx + 2; // +1 header, +1 1-based

    if (pinCol >= 0) {
      await writeRow(registryId, `Users!${columnIndexToLetter(pinCol)}${rowNumber}`, [newPin]);
    }
    if (mustChangeCol >= 0) {
      await writeRow(registryId, `Users!${columnIndexToLetter(mustChangeCol)}${rowNumber}`, ['FALSE']);
    }

    // Tulis langsung ke sheet, jadi cache Users harus dibuang agar PIN lama
    // tidak masih dipakai untuk login berikutnya.
    resetUsersCache();

    return NextResponse.json({ message: 'PIN berhasil diubah' });
  } catch (error) {
    console.error('Change PIN error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan pada server saat mengubah PIN' },
      { status: 500 }
    );
  }
});