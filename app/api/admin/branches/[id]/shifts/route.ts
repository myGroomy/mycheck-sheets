import { NextRequest, NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../../../lib/api-auth';
import { resolveCabang } from '../../../../../../lib/google/registry';
import { createShiftDefinition, listShiftDefinitions } from '../../../../../../lib/admin/template-service';

/**
 * Daftar definisi shift pada satu cabang.
 * Cabang diambil dari query `?branchId=...`; admin tanpa branchId memakai
 * cabang pertama yang bisa diakses.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const requested = new URL(req.url).searchParams.get('branchId');
  const targets = requested ? [requested] : ctx.branchIds;
  if (targets.length === 0) {
    return NextResponse.json({ shifts: [] });
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
  for (const cabangId of targets) {
    if (!ctx.branchIds.includes(cabangId)) continue;
    try {
      const { spreadsheetId } = await resolveCabang(cabangId);
      const definitions = await listShiftDefinitions(spreadsheetId);
      definitions.forEach((d) => {
        result.push({
          id: d.id,
          branchId: cabangId,
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
    } catch {
      // Cabang tanpa spreadsheet dilewati
    }
  }

  result.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return NextResponse.json({ shifts: result });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  // Branch id ada di path: /api/admin/branches/[id]/shifts
  const pathParts = new URL(req.url).pathname.split('/');
  const pathBranchId = pathParts[pathParts.length - 2];
  const branchId = String(
    body['branchId'] ?? new URL(req.url).searchParams.get('branchId') ?? pathBranchId ?? ''
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