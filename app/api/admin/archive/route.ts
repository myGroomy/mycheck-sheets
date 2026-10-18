import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '@/lib/api-auth';
import { archiveBranchYear, previewArchive } from '@/lib/archive-service';

export const maxDuration = 60;

function input(body: unknown): { action: 'preview' | 'apply'; branchId: string; year: string } | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  const action = value.action === 'apply' || value.action === 'preview' ? value.action : null;
  const branchId = typeof value.branchId === 'string' ? value.branchId.trim() : '';
  const year = typeof value.year === 'string' ? value.year.trim() : String(value.year ?? '').trim();
  if (!action || !branchId || !/^\d{4}$/.test(year)) return null;
  return { action, branchId, year };
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const roleError = requireRole(ctx, 'admin');
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Body harus berupa JSON.' } }, { status: 400 });
  }
  const parsed = input(body);
  if (!parsed) {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'action, branchId, dan year (YYYY) wajib diisi.' } }, { status: 400 });
  }

  try {
    const result = parsed.action === 'preview'
      ? { preview: await previewArchive(parsed.branchId, parsed.year) }
      : await archiveBranchYear(parsed.branchId, parsed.year);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memproses arsip.';
    return NextResponse.json({ success: false, error: message, details: { code: 'ARCHIVE_FAILED', message } }, { status: 400 });
  }
});
