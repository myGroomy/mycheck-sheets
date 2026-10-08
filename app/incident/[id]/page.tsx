import { IncidentDetail } from '@/components/incident/incident-detail';
import { requireUser } from '@/lib/page-auth';

export default async function IncidentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  return <IncidentDetail incidentId={params.id} />;
}
