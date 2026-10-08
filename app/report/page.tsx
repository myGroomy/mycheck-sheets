import { ReportList } from '@/components/report/report-list';
import { requireUser } from '@/lib/page-auth';

export default async function ReportPage() {
  await requireUser();
  return <ReportList />;
}
