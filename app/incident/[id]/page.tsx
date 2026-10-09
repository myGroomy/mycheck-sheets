import { IncidentDetail } from '@/components/incident/incident-detail';
import { requireUser } from '@/lib/page-auth';

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  return <IncidentDetail incidentId={id} />;
}
