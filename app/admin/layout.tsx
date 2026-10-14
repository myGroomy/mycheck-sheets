import { requireAdmin } from '@/lib/page-auth';

// Navigasi (termasuk side panel desktop) sekarang dipegang oleh
// <AppShell /> di root layout. Layout ini hanya menjaga penjaga redirect untuk
// area /admin.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <>{children}</>;
}