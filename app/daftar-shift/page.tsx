import { redirect } from 'next/navigation';
import { ShiftDashboardClient } from '@/components/shift/shift-dashboard';
import { getUser } from '@/lib/page-auth';

// `/daftar-shift` = daftar shift per cabang, tempat membuka atau bergabung
// ke shift. Beranda ada di `/`.
export default async function DaftarShiftPage() {
  const ctx = await getUser();
  if (!ctx) redirect('/login');
  if (ctx.user.role === 'admin') redirect('/admin');

  return <ShiftDashboardClient userId={ctx.user.id} userName={ctx.user.name} />;
}