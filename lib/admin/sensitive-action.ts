// lib/admin/sensitive-action.ts
// Verifikasi PIN admin untuk aksi sensitif (ubah peran / nonaktifkan akun /
// hapus config). Versi Google Sheets: PIN plaintext pada sheet Registry.Users.

import { listAllUsers } from '../google/registry-admin';

/**
 * Cocokkan PIN admin dari Registry. Return null bila valid, atau string
 * pesan kesalahan bila tidak valid.
 */
export async function verifyAdminPin(
  adminUsername: string,
  pin: string
): Promise<string | null> {
  if (!pin) return 'PIN konfirmasi admin wajib diisi';

  const users = await listAllUsers();
  const admin = users.find(
    (u) => u.Username.toLowerCase() === adminUsername.toLowerCase()
  );
  if (!admin) return 'User admin tidak ditemukan';
  if (!admin.Aktif) return 'Akun admin sedang tidak aktif';
  if (admin.Role !== 'admin') return 'User ini bukan admin';

  if (admin.PIN !== pin) return 'PIN konfirmasi admin salah';

  return null;
}

/** Jumlah admin aktif — dipakai untuk mencegah admin terakhir dinonaktifkan. */
export async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  const users = await listAllUsers();
  return users.filter(
    (u) => u.Role === 'admin' && u.Aktif && u.User_ID !== excludeUserId
  ).length;
}