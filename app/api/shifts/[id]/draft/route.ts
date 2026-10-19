import { NextResponse } from 'next/server';
import { getServerTime } from '../../../../../lib/db/server-time';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { DRAFT_SHEET, ensureDraftSheet, purgeDraftPhotos, shiftDraftId } from '../../../../../lib/draft-shift';
import type { ShiftDraftPayload } from '../../../../../lib/draft-types';
import { resolveInstance } from '../../../../../lib/instance-resolver';
import { asStr, findRowFresh, insertRow, updateRow } from '../../../../../lib/store';
import { deleteSheetRows } from '../../../../../lib/google/registry';
import {
  isShiftBufferEnabled,
  readBufferedDraft,
  removeBufferedDraft,
  writeBufferedDraft,
} from '../../../../../lib/shift-buffer';

const MAX_DRAFT_BYTES = 250_000;

function getShiftId(req: Request) {
  const parts = new URL(req.url).pathname.split('/');
  return parts[parts.length - 2];
}

function parsePayload(raw: unknown, shiftInstanceId: string, userId: string): ShiftDraftPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<ShiftDraftPayload>;
  if (value.shiftInstanceId !== shiftInstanceId || value.userId !== userId) return null;
  if (typeof value.shiftDate !== 'string' || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
  if (!value.points || typeof value.points !== 'object' || Array.isArray(value.points)) return null;
  return {
    shiftInstanceId,
    userId,
    shiftDate: value.shiftDate,
    updatedAt: value.updatedAt,
    points: value.points as ShiftDraftPayload['points'],
  };
}

export const GET = withAuth(async (req, ctx) => {
  const shiftInstanceId = getShiftId(req);
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  const accessError = requireBranchAccess(ctx, resolved.branchId);
  if (accessError) return accessError;
  if (String(resolved.instance.status) !== 'berjalan') return NextResponse.json({ draft: null });
  if (isShiftBufferEnabled()) {
    try {
      const draft = await readBufferedDraft(resolved.branchId, shiftInstanceId, ctx.user.id);
      return NextResponse.json({ draft });
    } catch {
      // Redis outage falls back to the Sheets backup for continuity.
    }
  }
  await ensureDraftSheet(resolved.spreadsheetId);
  const row = await findRowFresh(resolved.spreadsheetId, DRAFT_SHEET, 'id', shiftDraftId(shiftInstanceId, ctx.user.id));
  if (!row) return NextResponse.json({ draft: null });
  try {
    const payload = JSON.parse(asStr(row.data.payload)) as ShiftDraftPayload;
    return NextResponse.json({ draft: { ...payload, id: asStr(row.data.id), createdAt: asStr(row.data.created_at), updatedAt: asStr(row.data.updated_at) } });
  } catch {
    return NextResponse.json({ draft: null });
  }
});

export const PUT = withAuth(async (req, ctx) => {
  const shiftInstanceId = getShiftId(req);
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  const accessError = requireBranchAccess(ctx, resolved.branchId);
  if (accessError) return accessError;
  if (String(resolved.instance.status) !== 'berjalan') return NextResponse.json({ error: 'Shift sudah ditutup.' }, { status: 409 });
  let body: { draft?: unknown };
  try { body = (await req.json()) as { draft?: unknown }; } catch { return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 }); }
  const payload = parsePayload(body.draft, shiftInstanceId, ctx.user.id);
  if (!payload) return NextResponse.json({ error: 'Payload draft tidak valid' }, { status: 400 });
  if (JSON.stringify(payload).length > MAX_DRAFT_BYTES) return NextResponse.json({ error: 'Draft terlalu besar' }, { status: 413 });

  const now = getServerTime().toISOString();
  const id = shiftDraftId(shiftInstanceId, ctx.user.id);
  if (isShiftBufferEnabled()) {
    try {
      const existing = await readBufferedDraft(resolved.branchId, shiftInstanceId, ctx.user.id);
      await writeBufferedDraft(resolved.branchId, shiftInstanceId, ctx.user.id, payload, {
        id,
        createdAt: existing?.createdAt ?? now,
        serverUpdatedAt: now,
      });
      return NextResponse.json({ status: 'tersimpan_redis', updated_at: now });
    } catch {
      // Continue with the existing Sheets backup below.
    }
  }

  await ensureDraftSheet(resolved.spreadsheetId);
  const existing = await findRowFresh(resolved.spreadsheetId, DRAFT_SHEET, 'id', id);
  const row = {
    id, shift_instance_id: shiftInstanceId, user_id: ctx.user.id,
    shift_date: payload.shiftDate, payload: JSON.stringify(payload),
    client_updated_at: payload.updatedAt, updated_at: now, version: 1,
  };
  if (existing) await updateRow(resolved.spreadsheetId, DRAFT_SHEET, existing.rowNumber, row);
  else await insertRow(resolved.spreadsheetId, DRAFT_SHEET, { ...row, created_at: now });
  return NextResponse.json({ status: 'tersimpan', updated_at: now });
});

export const DELETE = withAuth(async (req, ctx) => {
  const shiftInstanceId = getShiftId(req);
  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  const accessError = requireBranchAccess(ctx, resolved.branchId);
  if (accessError) return accessError;
  if (isShiftBufferEnabled()) {
    try {
      await removeBufferedDraft(resolved.branchId, shiftInstanceId, ctx.user.id);
      return NextResponse.json({ status: 'dihapus' });
    } catch {
      // Continue with the existing Sheets cleanup below.
    }
  }
  await ensureDraftSheet(resolved.spreadsheetId);
  const row = await findRowFresh(resolved.spreadsheetId, DRAFT_SHEET, 'id', shiftDraftId(shiftInstanceId, ctx.user.id));
  if (row) {
    try {
      const payload = JSON.parse(asStr(row.data.payload));
      await purgeDraftPhotos(
        resolved.spreadsheetId,
        shiftInstanceId,
        asStr(resolved.instance.shift_date),
        ctx.user.id,
        payload,
      );
    } catch { /* photo cleanup is best-effort; draft deletion still proceeds */ }
    await deleteSheetRows(resolved.spreadsheetId, DRAFT_SHEET, row.rowNumber);
  }
  return NextResponse.json({ status: 'dihapus' });
});
