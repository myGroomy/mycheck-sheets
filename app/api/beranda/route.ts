// app/api/beranda/route.ts
// Endpoint tunggal untuk data Beranda menggantikan 4 panggilan terpisah.

import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/api-auth';
import { getDashboardSummary } from '../../../lib/domain/dashboard-service';

export const GET = withAuth(async (_req, ctx) => {
  try {
    const summary = await getDashboardSummary(ctx);
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat data beranda';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
});