// lib/admin/sensitive-action.ts
// Verifikasi PIN admin untuk aksi sensitif (ubah peran / nonaktifkan akun /
// hapus config). Versi Google Sheets: PIN plaintext pada sheet Registry.Users.
//
// Sengaja membaca sheet langsung lewat readSheetDataFresh bukan readSheetData
// yang ber-cache supaya PIN yang baru saja di-reset tidak ikut kedaluwarsa.
// Jadi semua jalur autentikasi (login, ganti PIN, verifikasi PIN admin) wajib
// pakai readSheetDataFresh, tidak boleh readSheetData.

import { getRegistrySpreadsheetId } from '../google/registry';
import { readSheetDataFresh, sheetToObjects } from '../google/sheets';
import { asBool, asStr } from '../store';
import { listAllUsers } from '../google/registry-admin';

interface FreshUser {
  User_ID: string;
  Username: string;
  PIN: string;
  Role: string;
  Aktif: boolean;
}

async function readUsersFresh(): Promise<FreshUser[]> {
  const { headers, rows } = await readSheetDataFresh(getRegistrySpreadsheetId(), 'Users');
  return (sheetToObjects(headers, rows) as Record<string, unknown>[]).map((r) => ({
    User_ID: asStr(r['User_ID']),
    Username: asStr(r['Username']),
    PIN: asStr(r['PIN']),
    Role: asStr(r['Role']),
    Aktif: asBool(r['Aktif']),
  }));
}

/**
 * Cocokkan PIN admin dari Registry. Return null bila valid, atau string
 * pesan kesalahan bila tidak valid.
 */
export async function verifyAdminPin(
  adminUsername: string,
  pin: string
): Promise<string | null> {
  if (!pin) return 'PIN konfirmasi admin wajib diisi';

  const admin = (await readUsersFresh()).find(
    (u) => u.Username.toLowerCase() === adminUsername.toLowerCase()
  );
  if (!admin) return 'User admin tidak ditemukan';
  if (!admin.Aktif) return 'Akun admin sedang tidak aktif';
  if (admin.Role !== 'admin') return 'User ini bukan admin';

  if (admin.PIN !== pin) return 'PIN konfirmasi admin salah';

  return null;
}

/** Jumlah admin aktif dipakai untuk mencegah admin terakhir dinonaktifkan. */
export async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  const users = await listAllUsers();
  return users.filter(
    (u) => u.Role === 'admin' && u.Aktif && u.User_ID !== excludeUserId
  ).length;
}