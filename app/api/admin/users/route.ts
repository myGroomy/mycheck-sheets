import { NextResponse } from 'next/server';
import { createUserSchema } from '@/lib/shared';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import {
  branchIdsOf,
  insertUser,
  getCabangList,
  listAllUsers,
  type UserRow,
} from '../../../../lib/google/registry-admin';

/** Bentuk user untuk response API (tidak pernah membocorkan PIN). */
function toApiUser(u: UserRow, cabangNames: Map<string, string>) {
  const ids = branchIdsOf(u);
  return {
    id: u.User_ID,
    name: u.Nama,
    username: u.Username,
    role: u.Role,
    isActive: u.Aktif,
    mustChangePin: u.Must_Change_Pin,
    lastLoginAt: null,
    pinChangedAt: null,
    createdAt: u.Created_At || null,
    // Bentuk lama yang dibaca frontend
    branchIds: ids,
    branches: ids.map((id) => ({ id, name: cabangNames.get(id) ?? id })),
  };
}

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const cabangs = await getCabangList();
  const cabangNames = new Map(cabangs.map((c) => [c.Cabang_ID, c.Nama_Cabang]));

  const userList = await listAllUsers();
  const usersWithAccess = userList.map((u) => toApiUser(u, cabangNames));

  return NextResponse.json({ users: usersWithAccess });
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

  const parseResult = createUserSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Input tidak valid', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { name, username, initialPin, role, branchIds } = parseResult.data;

  const existingUsers = await listAllUsers();
  if (existingUsers.some((u) => u.Username.toLowerCase() === username.toLowerCase())) {
    return NextResponse.json(
      { error: `Username '${username}' sudah digunakan.` },
      { status: 400 }
    );
  }

  const validCabangs = new Set((await getCabangList()).map((c) => c.Cabang_ID));
  const unknownBranch = branchIds.find((b) => !validCabangs.has(b));
  if (unknownBranch) {
    return NextResponse.json(
      { error: `Cabang '${unknownBranch}' tidak terdaftar di Daftar_Cabang.` },
      { status: 400 }
    );
  }

  // Role admin selalu punya akses ke seluruh cabang aktif
  const effectiveBranchIds = role === 'admin' ? [] : branchIds;

  const newUserId = `U-${Date.now()}`;
  await insertUser({
    User_ID: newUserId,
    Username: username,
    PIN: initialPin, // plaintext PIN (sesuai downgrade yang disepakati)
    Nama: name,
    Role: role,
    Cabang_ID: effectiveBranchIds.join(','),
    Aktif: true,
    Must_Change_Pin: true,
    Created_At: new Date().toISOString(),
  });

  return NextResponse.json(
    { message: 'User berhasil dibuat', userId: newUserId },
    { status: 201 }
  );
});