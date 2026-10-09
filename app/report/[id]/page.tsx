import { ReportDetail } from '@/components/report/report-detail';
import { requireUser } from '@/lib/page-auth';

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  return <ReportDetail reportId={id} />;
}
