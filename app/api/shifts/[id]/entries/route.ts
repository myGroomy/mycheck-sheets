import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import type { Snapshot } from '../../../../../lib/db/snapshot';
import { getServerTime } from '../../../../../lib/db/server-time';
import { computeTiming } from '../../../../../lib/shift/time';
import { requireBranchAccess, withAuth } from '../../../../../lib/api-auth';
import {
  ensureMonthlySheet,
  filterRows,
  findRow,
  insertRow,
  listMonthlyRows,
  updateRow,
} from '../../../../../lib/store';
import { resolveInstance } from '../../../../../lib/instance-resolver';
import { readTemplateSnapshot } from '../../../../../lib/template-snapshot';
import { entryId as deterministicEntryId } from '../../../../../lib/ids';
import { isCanonicalEntry, resetDuplicateEntryRows } from '../../../../../lib/concurrency';
import { listAllUsers } from '../../../../../lib/google/registry-admin';

type EntryAction = 'selesai' | 'batal' | 'skip' | 'ubah_nilai';

interface EntryBody {
  client_action_id?: string;
  point_ref?: string;
  action?: EntryAction;
  value?: string | number | boolean | null;
  skip_reason?: string;
  client_at?: string;
}

interface Validation {
  value: string | null;
  outOfRange: boolean;
}

const MAX_TEXT_LENGTH = 2000;
const CHOICE_INPUT_TYPES = new Set(['pilihan_ganda', 'kotak_centang', 'dropdown']);

function validateValue(
  inputType: string,
  raw: EntryBody['value'],
  min: number | null,
  max: number | null,
  options: string[] | null | undefined
): Validation | { error: string } {
  if (inputType === 'centang' || inputType === 'ok_tidak_ok') {
    if (typeof raw === 'boolean') return { value: raw ? 'true' : 'false', outOfRange: false };
    if (raw === 'true' || raw === 'false') return { value: raw, outOfRange: false };
    if (inputType === 'ok_tidak_ok' && (raw === 'ya' || raw === 'tidak')) {
      return { value: raw, outOfRange: false };
    }
    return { error: 'Nilai harus true/false' };
  }

  if (inputType === 'teks' || inputType === 'paragraf') {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { error: 'Nilai teks wajib diisi' };
    }
    const text = raw.trim();
    if (text.length > MAX_TEXT_LENGTH) {
      return { error: `Nilai teks maksimal ${MAX_TEXT_LENGTH} karakter` };
    }
    return { value: text, outOfRange: false };
  }

  if (inputType === 'angka') {
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (raw === null || raw === undefined || raw === '' || Number.isNaN(num)) {
      return { error: 'Nilai harus berupa angka' };
    }
    const outOfRange = (min !== null && num < min) || (max !== null && num > max);
    return { value: String(num), outOfRange };
  }

  if (inputType === 'foto') {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { error: 'Nilai foto harus berupa id foto' };
    }
    return { value: raw.trim(), outOfRange: false };
  }

  if (CHOICE_INPUT_TYPES.has(inputType)) {
    if (!Array.isArray(options) || options.length === 0) {
      return { error: 'Opsi jawaban pertanyaan tidak tersedia' };
    }
    if (inputType === 'kotak_centang') {
      if (typeof raw !== 'string') return { error: 'Pilih minimal satu jawaban' };
      let selected: unknown;
      try {
        selected = JSON.parse(raw);
      } catch {
        return { error: 'Jawaban pilihan tidak valid' };
      }
      if (
        !Array.isArray(selected) ||
        selected.length === 0 ||
        selected.some((choice) => typeof choice !== 'string' || !options.includes(choice)) ||
        new Set(selected).size !== selected.length
      ) {
        return { error: 'Jawaban harus berupa opsi yang tersedia' };
      }
      return { value: JSON.stringify(selected), outOfRange: false };
    }
    if (typeof raw !== 'string' || !options.includes(raw)) {
      return { error: 'Pilih salah satu opsi yang tersedia' };
    }
    return { value: raw, outOfRange: false };
  }

  if (inputType === 'tanggal_waktu') {
    if (
      typeof raw !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw) ||
      Number.isNaN(new Date(raw).getTime()) ||
      new Date(raw).toISOString() !== raw
    ) {
      return { error: 'Tanggal dan waktu harus valid' };
    }
    return { value: raw, outOfRange: false };
  }

  return { error: `Tipe input tidak dikenal: ${inputType}` };
}

async function getUserName(username: string): Promise<string | null> {
  const user = (await listAllUsers()).find(
    (candidate) => candidate.Username.toLowerCase() === username.toLowerCase()
  );
  return user?.Nama ?? null;
}

/**
 * Aksi checklist (BR-12). Satu aksi pengguna = satu operasi:
 * idempotency -> validasi shift berjalan -> proses BR-12 ->
 * UPSERT entries + INSERT entry_logs + upsert participants.
 */
export const POST = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const shiftInstanceId = new URL(_req.url).pathname.split('/').slice(-2)[0];

  let body: EntryBody;
  try {
    body = (await _req.json()) as EntryBody;
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const clientActionId = body.client_action_id;
  const pointRef = body.point_ref;
  const action = body.action;

  if (!clientActionId || !pointRef || !action) {
    return NextResponse.json(
      { error: 'client_action_id, point_ref, dan action wajib diisi' },
      { status: 400 }
    );
  }
  if (!['selesai', 'batal', 'skip', 'ubah_nilai'].includes(action)) {
    return NextResponse.json({ error: 'action tidak valid' }, { status: 400 });
  }

  const resolved = await resolveInstance(ctx, shiftInstanceId);
  if (!resolved) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 });
  }
  const { instance, spreadsheetId, branchId, branchTimezone, tabMonth } = resolved;

  const branchAccessError = requireBranchAccess(ctx, branchId);
  if (branchAccessError) return branchAccessError;

  const entriesTab = await ensureMonthlySheet(spreadsheetId, 'Entries', tabMonth);
  const logsTab = await ensureMonthlySheet(spreadsheetId, 'EntryLogs', tabMonth);

  // Idempotency: aksi yang sama diulang tidak boleh menggandakan efek
  const duplicateLogs = (await listMonthlyRows(spreadsheetId, 'EntryLogs', tabMonth)).filter(
    (r) => String(r['client_action_id']) === clientActionId
  );
  if (duplicateLogs[0]) {
    return NextResponse.json({
      status: 'duplikat',
      outcome: duplicateLogs[0]['outcome'],
      entry_id: duplicateLogs[0]['entry_id'],
      state: duplicateLogs[0]['new_state'],
      value: duplicateLogs[0]['value'],
    });
  }

  if (String(instance['status']) !== 'berjalan') {
    return NextResponse.json(
      { error: 'Shift sudah ditutup. Checklist tidak dapat diubah.', code: 'SHIFT_CLOSED' },
      { status: 409 }
    );
  }

  let snapshot: Snapshot;
  // Snapshot bisa gzip+base64 (lihat lib/template-snapshot.ts); JSON.parse
  // buta akan menolak format itu dan memblokir input checklist untuk shift lama.
  // null = kolom kosong ATAU tidak terbaca (rusak). Keduanya tidak boleh lolos.
  snapshot = readTemplateSnapshot(instance) ?? ({} as Snapshot);
  if (!snapshot.shift) {
    return NextResponse.json({ error: 'Snapshot template tidak valid' }, { status: 500 });
  }

  const point = (snapshot.categories ?? [])
    .flatMap((c) => c.points)
    .find((p) => p.point_ref === pointRef);
  if (!point) {
    return NextResponse.json(
      { error: 'Item checklist tidak ada pada shift ini' },
      { status: 404 }
    );
  }

  if (action === 'skip' && (body.skip_reason ?? '').trim().length < 3) {
    return NextResponse.json(
      { error: 'Alasan skip wajib diisi (minimal 3 karakter)' },
      { status: 400 }
    );
  }

  let value: string | null = null;
  let outOfRange = false;
  if (action === 'selesai' || action === 'ubah_nilai') {
    const inputTypes = Array.isArray(point.input_types) && point.input_types.length
      ? point.input_types
      : [point.input_type];
    if (inputTypes.length > 1) {
      let rawValues: unknown;
      try {
        rawValues = typeof body.value === 'string' ? JSON.parse(body.value) : body.value;
      } catch {
        return NextResponse.json({ error: 'Nilai kombinasi tidak valid.' }, { status: 400 });
      }
      if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) {
        return NextResponse.json({ error: 'Nilai kombinasi tidak valid.' }, { status: 400 });
      }
      const values = rawValues as Record<string, unknown>;
      if (Object.keys(values).length !== inputTypes.length || inputTypes.some((type) => !(type in values))) {
        return NextResponse.json({ error: 'Semua komponen input wajib diisi.' }, { status: 400 });
      }
      const normalized: Record<string, unknown> = {};
      const photoIds = new Set<string>();
      for (const type of inputTypes) {
        const raw = values[type];
        if (type === 'foto') {
          if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5 || raw.some((id) => typeof id !== 'string')) {
            return NextResponse.json({ error: 'Komponen foto wajib berisi 1 sampai 5 foto.' }, { status: 400 });
          }
          raw.forEach((id) => photoIds.add(id as string));
          normalized[type] = raw;
          continue;
        }
        const rawValue = type === 'kotak_centang' && Array.isArray(raw)
          ? JSON.stringify(raw)
          : raw as EntryBody['value'];
        const checked = validateValue(type, rawValue, point.number_min, point.number_max, point.options);
        if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
        normalized[type] = type === 'kotak_centang'
          ? JSON.parse(checked.value ?? '[]')
          : checked.value;
        outOfRange ||= checked.outOfRange;
      }
      const suppliedPhotos = values['foto'];
      if (photoIds.size !== (Array.isArray(suppliedPhotos) ? suppliedPhotos.length : 0)) {
        return NextResponse.json({ error: 'Daftar foto tidak valid.' }, { status: 400 });
      }
      if (photoIds.size) {
        const storedPhotos = await listMonthlyRows(spreadsheetId, 'Photos', tabMonth);
        const allowed = new Set(storedPhotos
          .filter((photo) =>
            String(photo['owner_type']) === 'entry' &&
            String(photo['owner_id']) === pointRef &&
            String(photo['shift_instance_id']) === shiftInstanceId &&
            String(photo['status']) === 'uploaded'
          )
          .map((photo) => String(photo['id'])));
        if ([...photoIds].some((id) => !allowed.has(id))) {
          return NextResponse.json({ error: 'Foto tidak terhubung dengan pertanyaan ini.' }, { status: 400 });
        }
      }
      value = JSON.stringify(normalized);
    } else {
      const validated = validateValue(
        point.input_type,
        body.value,
        point.number_min,
        point.number_max,
        point.options
      );
      if ('error' in validated) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      value = validated.value;
      outOfRange = validated.outOfRange;
    }
  }

  const now = getServerTime();
  const toleranceDefault = snapshot.settings?.tolerance_default_minutes ?? 15;

  // Cari entry yang benar-benar milik instance ini
  const shiftEntries = (await listMonthlyRows(spreadsheetId, 'Entries', tabMonth)).filter(
    (r) => String(r['shift_instance_id']) === shiftInstanceId
  );
  const entry = shiftEntries.find(
    (r) => String(r['point_ref']) === pointRef
  ) ?? null;

  const prevState = (entry?.['state'] as string) ?? 'belum';

  // BR-12: aksi pertama pada item diterima; `ubah_nilai` hanya boleh oleh petugas yang sama.
  const isOwnCorrection = action === 'ubah_nilai' && entry?.['completed_by'] === ctx.user.id;

  if (!isOwnCorrection && action !== 'batal' && entry && prevState !== 'belum') {
    // Kalah balapan: item sudah diselesaikan petugas lain
    const winnerName = entry['completed_by'] ? await getUserName(String(entry['completed_by'])) : null;
    await insertRow(spreadsheetId, logsTab, {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      entry_id: entry['id'],
      point_ref: pointRef,
      action,
      outcome: 'ditolak_kalah',
      user_id: ctx.user.id,
      winner_user_id: entry['completed_by'],
      prev_state: prevState,
      new_state: prevState,
      value,
      client_action_id: clientActionId,
      client_at: body.client_at ?? '',
      at: now.toISOString(),
      created_at: now.toISOString(),
    });
    return NextResponse.json(
      {
        error: `Sudah diselesaikan oleh ${winnerName ?? 'petugas lain'}`,
        code: 'BR12_CONFLICT',
        winner_user_id: entry['completed_by'],
        state: prevState,
      },
      { status: 409 }
    );
  }

  const newState = action === 'skip' ? 'skip' : action === 'batal' ? 'belum' : 'selesai';
  const skipReason = newState === 'skip' ? (body.skip_reason ?? '').trim() : '';
  const timing =
    newState === 'selesai'
      ? computeTiming(now, branchTimezone, point.target_time, point.tolerance_minutes, toleranceDefault)
      : { timingLabel: null, timingDeltaMinutes: null };

  const entryId = entry ? String(entry['id']) : deterministicEntryId(shiftInstanceId, pointRef);
  const entryPatch = {
    state: newState,
    value: newState === 'belum' ? '' : value,
    out_of_range: newState === 'belum' ? false : outOfRange,
    completed_by: newState === 'belum' ? '' : ctx.user.id,
    completed_at: newState === 'belum' ? '' : now.toISOString(),
    timing_label: timing.timingLabel ?? '',
    timing_delta_minutes: timing.timingDeltaMinutes ?? '',
    skip_reason: skipReason,
    updated_at: now.toISOString(),
  };

  if (entry) {
    const found = await findRow(spreadsheetId, entriesTab, 'id', entryId);
    if (found) {
      await updateRow(spreadsheetId, entriesTab, found.rowNumber, entryPatch);
    }
  } else {
    await insertRow(spreadsheetId, entriesTab, {
      id: entryId,
      shift_instance_id: shiftInstanceId,
      point_ref: pointRef,
      photo_ids: '',
      created_at: now.toISOString(),
      version: 1,
      ...entryPatch,
    });
  }

  // Rekonsiliasi BR-12: dua request paralel bisa sama-sama lolos pengecekan
  // "belum" di atas. Karena ID entry deterministik, keduanya menulis ID yang
  // sama; baris paling awal yang kanonik. Penulis yang barisnya bukan kanonik
  // membatalkan efeknya sendiri lalu mengembalikan 409.
  if (!entry && newState !== 'belum') {
    const { winner, canonical, rows } = await isCanonicalEntry(
      spreadsheetId,
      entriesTab,
      shiftInstanceId,
      pointRef,
      now.toISOString()
    );
    if (canonical && !winner) {
      await resetDuplicateEntryRows(
        spreadsheetId,
        entriesTab,
        rows,
        canonical.rowNumber,
        now.toISOString()
      );
      await insertRow(spreadsheetId, logsTab, {
        id: ulid(),
        shift_instance_id: shiftInstanceId,
        entry_id: entryId,
        point_ref: pointRef,
        action,
        outcome: 'ditolak_kalah',
        user_id: ctx.user.id,
        prev_state: prevState,
        new_state: newState,
        value,
        client_action_id: clientActionId,
        client_at: body.client_at ?? '',
        at: now.toISOString(),
        created_at: now.toISOString(),
      });
      return NextResponse.json(
        {
          error: 'Item sedang diselesaikan petugas lain',
          code: 'BR12_CONFLICT',
          state: newState,
        },
        { status: 409 }
      );
    }
  }

  await insertRow(spreadsheetId, logsTab, {
    id: ulid(),
    shift_instance_id: shiftInstanceId,
    entry_id: entryId,
    point_ref: pointRef,
    action,
    outcome: 'diterima',
    user_id: ctx.user.id,
    prev_state: prevState,
    new_state: newState,
    value,
    note: skipReason,
    client_action_id: clientActionId,
    client_at: body.client_at ?? '',
    at: now.toISOString(),
    created_at: now.toISOString(),
  });

  // Peserta baru ikut tercatat lewat aksi pertamanya
  const participantRows = await filterRows(spreadsheetId, 'Participants', (r) =>
    String(r['shift_instance_id']) === shiftInstanceId && String(r['user_id']) === ctx.user.id
  );
  const previousCounted = String(entry?.['completed_by'] ?? '') === ctx.user.id;
  const nextCounted = String(entryPatch.completed_by) === ctx.user.id;
  const participant: {
    user_id: string;
    name: string;
    is_pj: boolean;
    first_action_type: string;
    first_action_at: string;
    items_done: number;
  } = {
    user_id: ctx.user.id,
    name: ctx.user.name,
    is_pj: String(instance['pj_user_id']) === ctx.user.id,
    first_action_type: String(participantRows[0]?.['first_action_type'] ?? ''),
    first_action_at: String(participantRows[0]?.['first_action_at'] ?? ''),
    items_done:
      shiftEntries.filter((row) => String(row['completed_by'] ?? '') === ctx.user.id).length +
      Number(nextCounted) -
      Number(previousCounted),
  };
  if (!participantRows[0]) {
    participant.first_action_type =
      action === 'skip' ? 'skip' : point.input_type === 'centang' ? 'centang' : 'isi';
    participant.first_action_at = now.toISOString();
    await insertRow(spreadsheetId, 'Participants', {
      id: ulid(),
      shift_instance_id: shiftInstanceId,
      user_id: ctx.user.id,
      first_action_at: participant.first_action_at,
      first_action_type: participant.first_action_type,
      created_at: now.toISOString(),
    });
  }

  return NextResponse.json({
    status: 'diterima',
    entry: {
      entryId,
      state: newState,
      value: newState === 'belum' ? null : value,
      outOfRange: newState === 'belum' ? false : outOfRange,
      skipReason: skipReason || null,
      timingLabel: timing.timingLabel,
      timingDeltaMinutes: timing.timingDeltaMinutes,
      completedBy: nextCounted ? ctx.user.id : null,
      completedByName: nextCounted ? ctx.user.name : null,
      completedAt: nextCounted ? now.toISOString() : null,
      itemCountDelta: Number(nextCounted) - Number(previousCounted),
    },
    participant,
  });
});
