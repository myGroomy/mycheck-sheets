import { redirect } from 'next/navigation';
import { ShiftDashboardClient } from '@/components/shift/shift-dashboard';
import { getUser } from '@/lib/page-auth';

// `/daftar-shift` = daftar shift per cabang, tempat membuka atau bergabung
// ke shift. Beranda ada di `/`.
//
// Admin TIDAK lagi diarahkan ke /admin di sini. Model role sekarang
// "admin = petugas + privilege" (PLAN/SUPERUSER-ROLE-REFACTOR.md), jadi admin
// juga memakai halaman petugas ini. Admin tetap punya berandanya sendiri di
// /admin; ini cuma memastikan jalur petugas tidak tertutup untuknya.
export default async function DaftarShiftPage() {
  const ctx = await getUser();
  if (!ctx) redirect('/login');

  return <ShiftDashboardClient userId={ctx.user.id} userName={ctx.user.name} />;
}