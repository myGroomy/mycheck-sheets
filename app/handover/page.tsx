// app/handover/page.tsx
// Halaman Handover untuk PETUGAS: daftar riwayat serah terima antar shift.
//
// Petugas tidak punya akses ke template/config handover — itu urusan admin
// (bagian "Builder" di /admin/handover). Yang tampil di sini murni riwayat:
// shift sebelumnya, shift sebelum-sebelumnya, dan seterusnya.
//
// Karena halaman ini memakai GET /api/handovers (berbasis cabang), petugas
// tetap bisa membaca riwayat di luar jam shift.

import type { Metadata } from 'next';
import { getUser } from '@/lib/page-auth';
import { redirect } from 'next/navigation';
import { HandoverHistory } from '@/components/handover/handover-history';

export const metadata: Metadata = { title: 'Handover · MyCheck' };

export default async function HandoverPage() {
  const ctx = await getUser();
  if (!ctx) redirect('/login');
  // Admin punya halaman lengkap dengan builder di /admin/handover.
  if (ctx.user.role === 'admin') redirect('/admin/handover');

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6 md:pb-10 lg:px-8 xl:px-10 pb-24">
      <HandoverHistory />
    </main>
  );
}
