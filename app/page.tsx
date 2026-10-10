import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing-page';
import { getUser } from '@/lib/page-auth';

// `/` tidak lagi dipakai petugas — mereka langsung masuk ke checklist.
// Admin tetap ke `/admin`, tamu tetap melihat landing page.
export default async function Home() {
  const ctx = await getUser();
  if (!ctx) return <LandingPage />;

  if (ctx.user.role === 'admin') redirect('/admin');

  redirect('/daftar-shift');
}