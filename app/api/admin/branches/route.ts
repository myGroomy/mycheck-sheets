import { NextResponse } from 'next/server';
import { branchSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import { isValidTimeZone } from '../../../../lib/valid-timezone';
import {
  insertCabang,
  getCabangList,
  updateCabangStructure,
  type CabangRow,
} from '../../../../lib/google/registry-admin';
import { isGasConfigured, GasError } from '../../../../lib/google/gas-client';
import { createBranchStructureViaGas } from '../../../../lib/google/branch-gas';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      branchFolderId: b.Branch_Folder_ID || null,
      evidenceFolderId: b.Evidence_Folder_ID || null,
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

  // Cek apakah GAS sudah dikonfigurasi sebelum membuat baris Registry
  if (!isGasConfigured('admin')) {
    return NextResponse.json(
      { error: 'Layanan Google Apps Script belum dikonfigurasi. Hubungi admin untuk mengatur MYCHECK_GAS_URL dan MYCHECK_GAS_ADMIN_KEY.' },
      { status: 503 }
    );
  }

  const existing = await getCabangList();
  const existingBranch = existing.find((b) => (b.Kode || b.Cabang_ID) === code || b.Cabang_ID === code);
  if (existingBranch) {
    if (existingBranch.Aktif) {
      return NextResponse.json({ error: `Kode cabang '${code}' sudah digunakan.` }, { status: 400 });
    }
    // Jika cabang nonaktif (percobaan sebelumnya tertunda), tidak membuat baris ganda
  } else {
    // 3. Tulis Registry: baris baru dengan Aktif = false, Spreadsheet_ID = '', ID lain kosong
    const row: CabangRow = {
      Cabang_ID: code,
      Nama_Cabang: name,
      Kode: code,
      Timezone: timezone,
      Spreadsheet_ID: '',
      Folder_Drive_ID: '',
      Branch_Folder_ID: '',
      Evidence_Folder_ID: '',
      Aktif: false,
      Alamat: address?.trim() ?? '',
      Created_At: new Date().toISOString(),
    };
    await insertCabang(row);
  }

  // 4. GAS createBranchStructure
  let structure;
  try {
    structure = await createBranchStructureViaGas({ branchCode: code, branchName: name });
  } catch (gasErr) {
    const status = gasErr instanceof GasError ? gasErr.statusCode : 502;
    const message = gasErr instanceof Error ? gasErr.message : 'Pembuatan struktur cabang via GAS gagal.';
    return NextResponse.json(
      {
        error: message,
        catatan: 'Cabang telah terdaftar nonaktif di Registry. Ulangi proses setelah kendala diselesaikan.',
      },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }

  // 5. Update Registry: Spreadsheet_ID, Branch_Folder_ID, Evidence_Folder_ID, Aktif = true
  await updateCabangStructure(code, {
    spreadsheetId: structure.spreadsheetId,
    branchFolderId: structure.branchFolderId,
    evidenceFolderId: structure.evidenceFolderId,
    aktif: true,
  });

  // 6. Response
  return NextResponse.json(
    {
      branch: {
        id: code,
        name,
        code,
        timezone,
        spreadsheetId: structure.spreadsheetId,
        branchFolderId: structure.branchFolderId,
        evidenceFolderId: structure.evidenceFolderId,
        isActive: true,
        reused: structure.reused,
      },
    },
    { status: 201 }
  );
});