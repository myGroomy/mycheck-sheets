import { NextRequest, NextResponse } from 'next/server';
import { findTokenByValue, isTokenActive, rowNumberOfToken, updateShareTokenCells } from '../../../../../lib/google/share-tokens';
import { buildPublicReportDetail } from '../../../../../lib/report-detail';

/**
 * Laporan publik via share token TANPA autentikasi.
 * Token itu sendiri adalah kredensial: validitas dicek di sheet
 * `Share_Tokens` (Registry).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token wajib disediakan.' }, { status: 400 });
  }

  const share = await findTokenByValue(token);
  if (!share || share.revoked_at) {
    return NextResponse.json(
      { error: 'Token laporan tidak valid atau sudah dicabut.' },
      { status: 404 }
    );
  }
  if (!isTokenActive(share)) {
    return NextResponse.json({ error: 'Token laporan telah kedaluwarsa.' }, { status: 410 });
  }

  const result = await buildPublicReportDetail(token);
  if (result.state === 'invalid') {
    return NextResponse.json(
      { error: 'Token laporan tidak valid atau sudah dicabut.' },
      { status: 404 }
    );
  }
  if (result.state === 'expired') {
    return NextResponse.json({ error: 'Token laporan telah kedaluwarsa.' }, { status: 410 });
  }
  if (result.state === 'notfound') {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 });
  }

  // Rekam jumlah akses
  const rowNumber = await rowNumberOfToken(share.id);
  if (rowNumber != null) {
    await updateShareTokenCells(rowNumber, {
      access_count: Number(share.access_count || 0) + 1,
      last_accessed_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    valid: true,
    tokenId: share.id,
    report: result.detail.report,
    shift: result.detail.shift,
    branch: result.detail.branch,
    handover: result.detail.handover,
    incidents: result.detail.incidents,
    entries: result.detail.entries,
    participants: result.detail.participants,
    addenda: result.detail.addenda,
    expires_at: share.expires_at,
  });
}