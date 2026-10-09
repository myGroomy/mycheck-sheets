// app/api/admin/shift-instances/[id]/route.ts — aksi admin atas satu shift
// instance: tutup paksa (ADM-OP-02), ganti PJ (ADM-OP-03), void (ADM-OP-05).
//
// Ketiganya aksi sensitif: wajib alasan + konfirmasi PIN (ADM-SEC-01) dan
// tercatat di audit log (ADM-AL-02).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { verifyAdminPin } from '../../../../../lib/admin/sensitive-action';
import { runShiftOperation } from '../../../../../lib/admin/shift-operations';

const bodySchema = z.object({
  action: z.enum(['force_close', 'change_pj', 'void']),
  pin: z.string().length(6, 'PIN konfirmasi harus 6 digit').regex(/^\d{6}$/, 'PIN harus 6 angka'),
  reason: z.string().min(3, 'Alasan minimal 3 karakter'),
  newPjUserId: z.string().optional(),
});

export const PATCH = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const shiftInstanceId = new URL(_req.url).pathname.split('/').at(-1) ?? '';

  let raw: unknown;
  try {
    raw = await _req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { action, pin, reason, newPjUserId } = parsed.data;

  // PIN dicek sebelum perubahan apa pun supaya aksi yang gagal PIN tidak
  // meninggalkan efek samping.
  const pinErr = await verifyAdminPin(ctx.user.id, pin);
  if (pinErr) {
    return NextResponse.json({ error: pinErr }, { status: 403 });
  }

  try {
    const result = await runShiftOperation(ctx, action, shiftInstanceId, {
      reason: reason.trim(),
      newPjUserId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Aksi gagal.';
    // Galat aturan bisnis (status tidak sesuai, akses tidak cukup) = 409/403.
    const status = /tidak ditemukan/i.test(message)
      ? 404
      : /tidak punya akses|harus admin/i.test(message)
        ? 403
        : 409;
    return NextResponse.json({ error: message }, { status });
  }
});