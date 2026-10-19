// app/api/admin/reviews/route.ts — Fase 3 scoring: list & finalisasi review item.
// EntryReviews = sheet bulanan per cabang (MONTHLY_SHEETS).
import { NextResponse } from 'next/server';
import { withAuth, requireRole } from '../../../../lib/api-auth';
import { resolveCabang } from '../../../../lib/google/registry';
import {
  asNum,
  asStr,
  filterRows,
  findRowFresh,
  getPeriodSheet,
  listMonthlyRows,
  updateRow,
} from '../../../../lib/store';
import { appendAuditLogFor } from '../../../../lib/db/audit';
import { calculateAndRecordShiftScoring, isScoringEnabled } from '../../../../lib/scoring-engine';

function parseTabMonth(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  return value;
}

export const GET = withAuth(async (req, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branchId');
  const tabMonth = parseTabMonth(url.searchParams.get('tabMonth'));
  if (!branchId || !tabMonth) {
    return NextResponse.json(
      { error: 'branchId dan tabMonth (YYYY-MM) wajib diisi' },
      { status: 400 }
    );
  }
  if (!ctx.branchIds.includes(branchId)) {
    return NextResponse.json({ error: 'Akses cabang ditolak' }, { status: 403 });
  }

  try {
    const { spreadsheetId } = await resolveCabang(branchId);
    const rows = await listMonthlyRows(spreadsheetId, 'EntryReviews', tabMonth);
    const shiftInstanceId = url.searchParams.get('shiftInstanceId');
    const status = url.searchParams.get('status');
    const filtered = rows.filter((r) => {
      if (shiftInstanceId && asStr(r['shift_instance_id']) !== shiftInstanceId) return false;
      if (status && asStr(r['review_status']) !== status) return false;
      return true;
    });
    return NextResponse.json({ reviews: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membaca review';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const PATCH = withAuth(async (req, ctx) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  let body: {
    branchId?: string;
    tabMonth?: string;
    reviewId?: string;
    reviewStatus?: string;
    pointsAdjustment?: unknown;
    reviewNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const fg = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');
  const branchId = fg(body.branchId);
  const tabMonth = parseTabMonth(body.tabMonth ?? null);
  const reviewId = fg(body.reviewId);
  const reviewStatus = fg(body.reviewStatus);
  if (!branchId || !tabMonth || !reviewId || !reviewStatus) {
    return NextResponse.json(
      { error: 'branchId, tabMonth (YYYY-MM), reviewId, dan reviewStatus wajib diisi' },
      { status: 400 }
    );
  }
  if (!['menunggu', 'disetujui', 'disesuaikan', 'ditolak'].includes(reviewStatus)) {
    return NextResponse.json({ error: 'reviewStatus tidak valid' }, { status: 400 });
  }
  if (!ctx.branchIds.includes(branchId)) {
    return NextResponse.json({ error: 'Akses cabang ditolak' }, { status: 403 });
  }

  try {
    const { spreadsheetId } = await resolveCabang(branchId);
    // Pembacaan segar + tab fisik sesuai period_mode (flat/monthly/yearly).
    const tab = await getPeriodSheet(spreadsheetId, 'EntryReviews', tabMonth);
    const hit = await findRowFresh(spreadsheetId, tab, 'id', reviewId);
    if (!hit) {
      return NextResponse.json({ error: 'Review tidak ditemukan' }, { status: 404 });
    }
    const current = hit.data;
    const base = asNum(current['base_points']) ?? 0;
    const earned = asNum(current['earned_points']) ?? 0;
    const adjInput = body.pointsAdjustment;
    const pointsAdjustment =
      adjInput === undefined || adjInput === null ? (asNum(current['points_adjustment']) ?? 0)
        : Math.trunc(Number(adjInput));
    if (!Number.isFinite(pointsAdjustment)) {
      return NextResponse.json({ error: 'pointsAdjustment harus berupa angka' }, { status: 400 });
    }
    // Skor melewati base hanya boleh dari evaluasi otomatis; penyesuaian admin
    // bergerak dalam [0, base]. Bonus dari review otomatis dipertahankan.
    const sourceBonus = Math.max(0, earned - base);
    const awarded = Math.max(0, Math.min(base, base + pointsAdjustment) + sourceBonus);

    const now = new Date().toISOString();
    const awardedValue = awarded;
    const updates = {
      review_status: reviewStatus,
      points_adjustment: pointsAdjustment,
      awarded_points: awardedValue,
      review_note: typeof body.reviewNote === 'string' ? body.reviewNote : asStr(current['review_note']),
      reviewed_by: ctx.user.id,
      reviewed_at: now,
      review_stage: 'final',
      version: String(Number(asNum(current['version']) ?? 1) + 1),
    };
    await updateRow(spreadsheetId, tab, hit.rowNumber, updates);
    await appendAuditLogFor(spreadsheetId, {
      actorId: ctx.user.id,
      action: 'review_entry',
      objectType: 'entry_review',
      objectId: reviewId,
      branchId,
      after: { review_status: reviewStatus, points_adjustment: pointsAdjustment, awarded_points: awardedValue },
    });

    // Fase 18: koreksi/penyelesaian review final menyiapkan ulang ledger skor
    // shift terkait (upsert idempoten). Best-effort.
    if (isScoringEnabled()) {
      try {
        const reportHit = (await filterRows(
          spreadsheetId,
          'Reports',
          (r) => asStr(r['shift_instance_id']) === asStr(current['shift_instance_id'])
        ))[0];
        if (reportHit) {
          await calculateAndRecordShiftScoring(
            spreadsheetId,
            branchId,
            asStr(current['shift_instance_id']),
            asStr(reportHit['id']),
            1
          );
        }
      } catch {
        // kegagalan perekaman ulang skor tidak boleh membatalkan review.
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui review';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
