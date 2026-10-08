import { redirect } from 'next/navigation';
import { ShiftDashboardClient } from '@/components/shift/shift-dashboard';
import { LandingPage } from '@/components/landing-page';
import { getUser } from '@/lib/page-auth';

export default async function Home() {
  const ctx = await getUser();
  if (!ctx) return <LandingPage />;

  if (ctx.user.role === 'admin') redirect('/admin');

  return <ShiftDashboardClient userId={ctx.user.id} userName={ctx.user.name} />;
}
