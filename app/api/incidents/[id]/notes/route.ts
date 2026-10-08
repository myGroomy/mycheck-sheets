// app/api/incidents/[id]/notes/route.ts — Phase 4 (Sheets).
// POST catatan tindak lanjut (IN-06): penulis + waktu tercatat, isi awal tak diubah.
import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import { appendAuditLogFor } from '../../../../../lib/db/audit';
import { insertRow } from '../../../../../lib/store';
import { monthlySheet } from '../../../../../lib/google/branch-schema';
import { ensureIncidentTabs, findIncidentAcrossBranches, incidentTabMonth } from '../../../../../lib/incidents';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const incidentId = new URL(req.url).pathname.split('/').slice(-2)[0];
  let body: { note?: string } = {};
  try { body = (await req.json()) as { note?: string }; } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }
  const note = body.note?.trim();
  if (!note) return NextResponse.json({ error: 'note wajib diisi' }, { status: 400 });
  if (note.length > 2000) return NextResponse.json({ error: 'Catatan maksimal 2000 karakter.' }, { status: 400 });
  const located = await findIncidentAcrossBranches(ctx, incidentId);
  if (!located) return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 });
  const branchAccessError = requireBranchAccess(ctx, located.branchId);
  if (branchAccessError) return branchAccessError;
  const tabMonth = incidentTabMonth(located.incident);
  await ensureIncidentTabs(located.spreadsheetId, tabMonth);
  const rowId = ulid();
  const now = new Date().toISOString();
  await insertRow(located.spreadsheetId, monthlySheet('IncidentNotes', tabMonth), {
    id: rowId, incident_id: incidentId, author_id: ctx.user.id,
    author_role: ctx.user.role, note, created_at: now,
  });
  await appendAuditLogFor(located.spreadsheetId, {
    actorId: ctx.user.id, action: 'add_incident_note', objectType: 'incident', objectId: incidentId,
    branchId: located.branchId, after: { note: note.slice(0, 200) },
  });
  return NextResponse.json({ status: 'dibuat', note_id: rowId });
});
