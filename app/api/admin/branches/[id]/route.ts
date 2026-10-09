import { NextResponse } from 'next/server';
import { branchSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../../lib/api-auth';
import { isValidTimeZone } from '../../../../../lib/valid-timezone';
import {
  deleteCabangRow,
  getCabangList,
  updateCabangCells,
} from '../../../../../lib/google/registry-admin';
import { listRowsWithNumber } from '../../../../../lib/store';
import { getRegistrySpreadsheetId } from '../../../../../lib/google/registry';
import { CABANG_SHEET } from '../../../../../lib/google/registry-admin';

/** Nomor baris fisik (1-based) cabang di sheet Daftar_Cabang. */
async function findCabangRowNumber(cabangId: string): Promise<number | null> {
  const registryId = getRegistrySpreadsheetId();
  const rows = await listRowsWithNumber(registryId, CABANG_SHEET);
  const hit = rows.find((r) => String(r.data['Cabang_ID'] ?? '') === cabangId);
  return hit ? hit.rowNumber : null;
}

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const branch = (await getCabangList()).find((b) => b.Cabang_ID === id);
  if (!branch) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json({
    branch: {
      id: branch.Cabang_ID,
      name: branch.Nama_Cabang,
      code: branch.Kode || branch.Cabang_ID,
      timezone: branch.Timezone || 'Asia/Jakarta',
      spreadsheetId: branch.Spreadsheet_ID,
      folderDriveId: branch.Folder_Drive_ID,
      isActive: branch.Aktif,
      address: branch.Alamat || null,
    },
  });
});

export const PUT = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  let body: unknown;
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const parseResult = branchSchema.partial().safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const updateData = parseResult.data;
  if (updateData.timezone !== undefined && !isValidTimeZone(updateData.timezone)) {
    return NextResponse.json(
      { error: `Timezone '${updateData.timezone}' bukan zona waktu IANA yang valid (misal: Asia/Jakarta).` },
      { status: 400 }
    );
  }

  const existing = (await getCabangList()).find((b) => b.Cabang_ID === id);
  if (!existing) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan' }, { status: 404 });
  }

  const rowNumber = await findCabangRowNumber(id);
  if (rowNumber == null) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (updateData.name !== undefined) updates['Nama_Cabang'] = updateData.name;
  if (updateData.code !== undefined) updates['Kode'] = updateData.code;
  if (updateData.timezone !== undefined) updates['Timezone'] = updateData.timezone;
  if (updateData.address !== undefined) updates['Alamat'] = updateData.address;
  if ((body as { isActive?: boolean }).isActive !== undefined) {
    updates['Aktif'] = (body as { isActive: boolean }).isActive;
  }

  // Cabang tidak boleh aktif tanpa Spreadsheet_ID
  const nextSpreadsheetId = (updates['Spreadsheet_ID'] as string) ?? existing.Spreadsheet_ID;
  if (updates['Aktif'] === true && !nextSpreadsheetId) {
    return NextResponse.json(
      { error: 'Spreadsheet_ID masih kosong. Isi Spreadsheet_ID cabang sebelum mengaktifkan.' },
      { status: 400 }
    );
  }

  await updateCabangCells(rowNumber, updates);

  return NextResponse.json({ message: 'Cabang berhasil diperbarui' });
});

export const DELETE = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const pathParts = new URL(_req.url).pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  const existing = (await getCabangList()).find((b) => b.Cabang_ID === id);
  if (!existing) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan' }, { status: 404 });
  }

  const rowNumber = await findCabangRowNumber(id);
  if (rowNumber == null) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan' }, { status: 404 });
  }

  // Jangan hapus cabang yang Spreadsheet_ID-nya dipakai user sebagai akses
  const { listAllUsers } = await import('../../../../../lib/google/registry-admin');
  const users = await listAllUsers();
  const usedBy = users
    .filter((u) => String(u.Cabang_ID).split(',').map((s) => s.trim()).includes(id))
    .map((u) => u.Username);
  if (usedBy.length > 0) {
    return NextResponse.json(
      { error: `Cabang masih diakses oleh user: ${usedBy.join(', ')}. Hapus aksesnya dulu.` },
      { status: 409 }
    );
  }

  await deleteCabangRow(rowNumber);

  return NextResponse.json({ message: 'Cabang berhasil dihapus' });
});