import { requireAdmin } from '@/lib/page-auth';
import { AdminShell } from '@/components/admin/shell';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAdmin();

  return (
    <AdminShell user={{ name: ctx.user.name, username: ctx.user.username }}>
      {children}
    </AdminShell>
  );
}
