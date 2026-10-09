import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/cron';

export async function GET(_req: NextRequest) {
  const authErr = requireCronSecret(_req);
  if (authErr) return authErr;

  return NextResponse.json({ ok: true, message: 'Cron secret valid.' });
}
