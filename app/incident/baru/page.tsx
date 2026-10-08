import { IncidentCreateForm } from '@/components/incident/incident-create-form';
import { requireUser } from '@/lib/page-auth';

export default async function CreateIncidentPage() {
  await requireUser();
  return <IncidentCreateForm />;
}
