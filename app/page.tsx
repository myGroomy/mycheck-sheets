import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing-page';
import { PetugasHome } from '@/components/shift/petugas-home';
import { getUser } from '@/lib/page-auth';

// `/` untuk petugas adalah Beranda (ringkasan hari ini). Daftar shift yang
// bisa dibuka/digabung ada di `/daftar-shift`.
export default async function Home() {
  const ctx = await getUser();
  if (!ctx) return <LandingPage />;

  if (ctx.user.role === 'admin') redirect('/admin');

  return (
    <PetugasHome
      userId={ctx.user.id}
      userName={ctx.user.name}
      username={ctx.user.username}
      role={ctx.user.role}
    />
  );
}