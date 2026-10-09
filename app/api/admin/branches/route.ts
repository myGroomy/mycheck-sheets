import { NextResponse } from 'next/server';
import { branchSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { isValidTimeZone } from '../../../../lib/valid-timezone';
import {
  insertCabang,
  getCabangList,
  type CabangRow,
} from '../../../../lib/google/registry-admin';

const folderDriveId = () => process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const branchList = await getCabangList();

  return NextResponse.json({
    branches: branchList.map((b, i) => ({
      id: b.Cabang_ID,
      name: b.Nama_Cabang,
      code: b.Kode || b.Cabang_ID,
      timezone: b.Timezone || 'Asia/Jakarta',
      spreadsheetId: b.Spreadsheet_ID,
      folderDriveId: b.Folder_Drive_ID,
      isActive: b.Aktif,
      address: b.Alamat || null,
      // Facade ke bentuk lama (frontend masih membaca snake_case)
      spreadsheet_id: b.Spreadsheet_ID,
      folder_drive_id: b.Folder_Drive_ID,
      is_active: b.Aktif,
      createdAt: null,
      _order: i,
    })),
  });
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  let body: unknown;
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const parseResult = branchSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { name, code, timezone, address } = parseResult.data;

  if (!isValidTimeZone(timezone)) {
    return NextResponse.json(
      { error: `Timezone '${timezone}' bukan zona waktu IANA yang valid (misal: Asia/Jakarta).` },
      { status: 400 }
    );
  }

  const existing = await getCabangList();
  if (existing.some((b) => (b.Kode || b.Cabang_ID) === code)) {
    return NextResponse.json({ error: `Kode cabang '${code}' sudah digunakan.` }, { status: 400 });
  }
  if (existing.some((b) => b.Cabang_ID === code)) {
    return NextResponse.json({ error: `Cabang '${code}' sudah terdaftar.` }, { status: 400 });
  }

  const cabangId = code;
  const row: CabangRow = {
    Cabang_ID: cabangId,
    Nama_Cabang: name,
    Kode: code,
    Timezone: timezone,
    // Spreadsheet cabang dibuat manual (copy template) lalu diisi di sini.
    Spreadsheet_ID: '',
    Folder_Drive_ID: folderDriveId(),
    Aktif: false, // aktif setelah Spreadsheet_ID diisi & di-share ke service account
    Alamat: address?.trim() ?? '',
    Created_At: new Date().toISOString(),
  };

  await insertCabang(row);

  return NextResponse.json(
    {
      branch: {
        id: row.Cabang_ID,
        name: row.Nama_Cabang,
        code: row.Kode,
        timezone: row.Timezone,
        spreadsheetId: row.Spreadsheet_ID,
        folderDriveId: row.Folder_Drive_ID,
        isActive: row.Aktif,
      },
      catatan:
        'Cabang dibuat nonaktif. Isi Spreadsheet_ID (hasil copy template) lalu aktifkan.',
    },
    { status: 201 }
  );
});