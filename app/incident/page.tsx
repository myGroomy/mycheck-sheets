import { IncidentList } from '@/components/incident/incident-list';
import { requireUser } from '@/lib/page-auth';

export default async function IncidentPage() {
  await requireUser();
  return <IncidentList />;
}
