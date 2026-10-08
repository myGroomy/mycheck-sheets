import { ReportDetail } from '@/components/report/report-detail';
import { requireUser } from '@/lib/page-auth';

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  return <ReportDetail reportId={params.id} />;
}
