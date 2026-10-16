// app/admin/kategori-incident/page.tsx
// Legacy redirect: pindah ke /admin/incident/kategori

import { redirect } from 'next/navigation';

export default function LegacyKategoriPage() {
  redirect('/admin/incident/kategori');
}