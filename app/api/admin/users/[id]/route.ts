import { NextRequest, NextResponse } from 'next/server';
import { updateUserSchema, sensitiveActionSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { verifyAdminPin, countActiveAdmins } from '../../../../../lib/admin/sensitive-action';
import {
  deleteUserRow,
  listAllCabang,
  listAllUsers,
  updateUserCells,
  USERS_SHEET,
} from '../../../../../lib/google/registry-admin';
import { getRegistrySpreadsheetId } from '../../../../../lib/google/registry';
import { listRowsWithNumber } from '../../../../../lib/store';

async function findUserRowNumber(userId: string): Promise<number | null> {
  const rows = await listRowsWithNumber(getRegistrySpreadsheetId(), USERS_SHEET);
  const hit = rows.find((r) => String(r.data['User_ID'] ?? '') === userId);
  return hit ? hit.rowNumber : null;
}

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const targetUserId = pathParts[pathParts.length - 1];

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const parseResult = updateUserSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const existing = (await listAllUsers()).find((u) => u.User_ID === targetUserId);
  if (!existing) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  const { name, role, branchIds, isActive } = parseResult.data;

  // Aksi sensitif (ubah peran / akses cabang / nonaktifkan) wajib PIN + alasan
  const isSensitiveChange =
    role !== undefined || isActive !== undefined || branchIds !== undefined;
  const sensitiveBody = sensitiveActionSchema.safeParse(body);
  if (isSensitiveChange && !sensitiveBody.success) {
    return NextResponse.json(
      {
        error:
          'Ubah peran/nonaktifkan akun wajib menyertakan alasan dan PIN konfirmasi admin',
        details: sensitiveBody.error.flatten(),
      },
      { status: 400 }
    );
  }
  if (isSensitiveChange && sensitiveBody.success) {
    const pinErr = await verifyAdminPin(ctx.user.id, String(sensitiveBody.data.pin ?? ''));
    if (pinErr) {
      return NextResponse.json({ error: pinErr }, { status: 403 });
    }
  }

  // Jangan izinkan admin terakhir dinonaktifkan atau diturunkan perannya
  if (existing.Role === 'admin' && (isActive === false || role === 'petugas')) {
    if ((await countActiveAdmins(targetUserId)) < 1) {
      return NextResponse.json(
        { error: 'Operasi ditolak. Sistem harus memiliki setidaknya 1 admin aktif.' },
        { status: 400 }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates['Nama'] = name;
  if (role !== undefined) updates['Role'] = role;
  if (isActive !== undefined) updates['Aktif'] = isActive;

  if (branchIds !== undefined) {
    const validCabangs = new Set((await listAllCabang()).map((c) => c.Cabang_ID));
    const unknown = branchIds.find((b) => !validCabangs.has(b));
    if (unknown) {
      return NextResponse.json(
        { error: `Cabang '${unknown}' tidak terdaftar di Daftar_Cabang.` },
        { status: 400 }
      );
    }
    // Admin implicitly punya akses ke semua cabang; simpan kosong.
    const effectiveRole = role ?? existing.Role;
    updates['Cabang_ID'] = effectiveRole === 'admin' ? '' : branchIds.join(',');
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: 'Tidak ada perubahan' });
  }

  const rowNumber = await findUserRowNumber(targetUserId);
  if (rowNumber == null) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  await updateUserCells(rowNumber, updates);

  return NextResponse.json({ message: 'User berhasil diperbarui' });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(req.url).pathname.split('/');
  const targetUserId = pathParts[pathParts.length - 1];

  const existing = (await listAllUsers()).find((u) => u.User_ID === targetUserId);
  if (!existing) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  if (existing.User_ID === ctx.user.id) {
    return NextResponse.json(
      { error: 'Tidak bisa menghapus akun Anda sendiri.' },
      { status: 400 }
    );
  }

  if (existing.Role === 'admin') {
    const pinErr = await verifyAdminPin(ctx.user.id, new URL(req.url).searchParams.get('pin') ?? '');
    if (pinErr) return NextResponse.json({ error: pinErr }, { status: 403 });
    if ((await countActiveAdmins(targetUserId)) < 1) {
      return NextResponse.json(
        { error: 'Operasi ditolak. Sistem harus memiliki setidaknya 1 admin aktif.' },
        { status: 400 }
      );
    }
  }

  const rowNumber = await findUserRowNumber(targetUserId);
  if (rowNumber == null) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
  }

  await deleteUserRow(rowNumber);

  return NextResponse.json({ message: 'User berhasil dihapus' });
});