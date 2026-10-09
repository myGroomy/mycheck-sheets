// app/api/admin/shift-instances/open-on-behalf/route.ts — ADM-OP-04.
// Buka shift atas nama petugas tertentu bila PJ lupa membuka.
//
// Tanpa konfirmasi PIN: ADM-SEC-01 tidak memasukkan aksi ini ke daftar aksi
// sensitif (yang wajib PIN adalah tutup paksa, ganti PJ, void, buka kunci
// laporan, reset PIN, ubah peran/akses, nonaktifkan akun). Alasan tetap wajib
// dan aksi tetap masuk audit log.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { openShiftOnBehalf } from '../../../../../lib/admin/shift-operations';

const bodySchema = z.object({
  shiftDefinitionId: z.string().min(1, 'shiftDefinitionId wajib diisi'),
  targetUserId: z.string().min(1, 'Pilih petugas yang akan menjadi PJ'),
  reason: z.string().min(3, 'Alasan minimal 3 karakter'),
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

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

  try {
    const result = await openShiftOnBehalf(
      ctx,
      parsed.data.shiftDefinitionId,
      parsed.data.targetUserId,
      parsed.data.reason.trim()
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membuka shift.';
    const status = /tidak ditemukan/i.test(message) ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
});