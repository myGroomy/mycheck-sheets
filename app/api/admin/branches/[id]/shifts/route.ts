import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { resolveCabang } from '../../../../../../lib/google/registry';
import { createShiftDefinition, listShiftDefinitions } from '../../../../../../lib/admin/template-service';

/**
 * Daftar definisi shift pada cabang di URL. Admin dapat meminta cabang lain
 * yang memang termasuk dalam aksesnya lewat query `?branchId=...`.
 */
export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const url = new URL(_req.url);
  const pathParts = url.pathname.split('/');
  const pathBranchId = pathParts[pathParts.length - 2] ?? '';
  const requested = url.searchParams.get('branchId');
  const branchId = requested || pathBranchId;
  if (!branchId) {
    return NextResponse.json({ error: 'branchId wajib diisi' }, { status: 400 });
  }
  if (requested && requested !== pathBranchId) {
    return NextResponse.json({ error: 'branchId tidak sesuai dengan URL.' }, { status: 400 });
  }
  if (!ctx.branchIds.includes(branchId)) {
    return NextResponse.json({ error: 'Akses ditolak untuk cabang ini.' }, { status: 403 });
  }

  const result: {
    id: unknown;
    branchId: string;
    name: unknown;
    startTime: unknown;
    endTime: unknown;
    crossesMidnight: boolean;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    version: number;
  }[] = [];
  try {
    const { spreadsheetId } = await resolveCabang(branchId);
    const definitions = await listShiftDefinitions(spreadsheetId);
    definitions.forEach((d) => {
      result.push({
        id: d.id,
        branchId,
        name: d.name,
        startTime: d.start_time,
        endTime: d.end_time,
        crossesMidnight: d.crosses_midnight,
        sortOrder: d.sort_order,
        isActive: d.is_active,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        version: d.version,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat definisi shift.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  result.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return NextResponse.json({ shifts: result });
});

export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  let body: Record<string, unknown>;
  try {
    body = (await _req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  // Branch id ada di path: /api/admin/branches/[id]/shifts
  const pathParts = new URL(_req.url).pathname.split('/');
  const pathBranchId = pathParts[pathParts.length - 2];
  const branchId = String(
    body['branchId'] ?? new URL(_req.url).searchParams.get('branchId') ?? pathBranchId ?? ''
  );
  if (!branchId) {
    return NextResponse.json({ error: 'branchId wajib diisi' }, { status: 400 });
  }
  if (!ctx.branchIds.includes(branchId)) {
    return NextResponse.json({ error: 'Akses ditolak untuk cabang ini.' }, { status: 403 });
  }

  const name = String(body['name'] ?? '').trim();
  const startTime = String(body['startTime'] ?? body['start_time'] ?? '').trim();
  const endTime = String(body['endTime'] ?? body['end_time'] ?? '').trim();
  if (!name || !startTime || !endTime) {
    return NextResponse.json(
      { error: 'name, startTime, dan endTime wajib diisi' },
      { status: 400 }
    );
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json(
      { error: 'Format waktu harus HH:MM (misal 07:00).' },
      { status: 400 }
    );
  }

  const { spreadsheetId } = await resolveCabang(branchId);

  const created = await createShiftDefinition(spreadsheetId, {
    name,
    start_time: startTime,
    end_time: endTime,
    crosses_midnight: Boolean(
      body['crossesMidnight'] ?? body['crosses_midnight'] ?? false
    ),
    sort_order: Number(body['sortOrder'] ?? body['sort_order'] ?? 0) || 0,
    is_active: Boolean(body['isActive'] ?? body['is_active'] ?? true),
  });

  return NextResponse.json(
    {
      message: 'Definisi shift berhasil dibuat',
      shift: {
        id: created.id,
        branchId,
        name: created.name,
        startTime: created.start_time,
        endTime: created.end_time,
        crossesMidnight: created.crosses_midnight,
        sortOrder: created.sort_order,
        isActive: created.is_active,
        createdAt: created.created_at,
        version: created.version,
      },
    },
    { status: 201 }
  );
});