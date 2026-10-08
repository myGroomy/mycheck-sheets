import { ShiftChecklistClient } from '@/components/shift/shift-checklist';
import { requireUser } from '@/lib/page-auth';

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireUser();
  return <ShiftChecklistClient shiftId={id} userId={ctx.user.id} />;
}
