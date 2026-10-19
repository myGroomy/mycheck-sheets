// lib/scoring-engine.ts
import { asStr, asNum, findRow, filterRows, insertRow, listMonthlyRows, updateRow } from './store';
import { tabMonthOf } from './instance-resolver';
import { readTemplateSnapshot } from './template-snapshot';
import { deterministicId } from './ids';
import { getServerTime } from './db/server-time';

/** Kill-switch rollback: SCORE_DEPLOY=0 melewati penulisan ScoreLedger tanpa menyentuh kolom. */
export function isScoringEnabled(): boolean {
  return process.env.SCORE_DEPLOY !== '0';
}

export interface ScoreEngineResult {  branchScore: {
    available: number;
    earned: number;
    incidentPenalty: number;
    finalPoints: number;
    scorePercent: number;
  };
  pjScores: Record<string, {
    available: number;
    earned: number;
    scorePercent: number;
    ratio: number;
  }>;
  userActionScores: Record<string, {
    available: number;
    earned: number;
    scorePercent: number;
  }>;
  userTotalScores: Record<string, {
    totalScore: number | null;
    pjScore: number | null;
    actionScore: number | null;
    pjShiftsCount: number;
    actionContributionsCount: number;
    branchesCount: number;
    checklistDoneCount: number;
    incidentPenalty: number;
  }>;
}

/**
 * Kalkulasi skor lengkap untuk sebuah shift instance dan tulis ke ScoreLedger secara idempoten.
 */
export async function calculateAndRecordShiftScoring(
  spreadsheetId: string,
  branchId: string,
  shiftInstanceId: string,
  reportId: string,
  scoreVersion = 1
): Promise<ScoreEngineResult> {
  const shiftHits = await filterRows(spreadsheetId, 'ShiftInstances', (r) => asStr(r['id']) === shiftInstanceId);
  const shift = shiftHits[0];
  if (!shift) throw new Error('ShiftInstance tidak ditemukan: ' + shiftInstanceId);

  const tabMonth = tabMonthOf(shift);
  const snapshot = readTemplateSnapshot(shift);
  const allPointsMap = new Map<string, number>();
  if (snapshot?.categories) {
    for (const cat of snapshot.categories) {
      if (cat.points) {
        for (const pt of cat.points) {
          const ref = asStr(pt.point_ref) || asStr((pt as { id?: unknown }).id);
          if (ref) allPointsMap.set(ref, asNum(pt.points) || 1);
        }
      }
    }
  }

  // 1. Ambil Entries & EntryReviews
  const entries = (await listMonthlyRows(spreadsheetId, 'Entries', tabMonth))
    .filter((e) => asStr(e['shift_instance_id']) === shiftInstanceId);
  
  const reviews = (await listMonthlyRows(spreadsheetId, 'EntryReviews', tabMonth))
    .filter((r) => asStr(r['shift_instance_id']) === shiftInstanceId);
  const reviewByEntryId = new Map(reviews.map((r) => [asStr(r['entry_id']), r]));

  // 2. Ambil Incidents untuk penalti
  const incidents = (await listMonthlyRows(spreadsheetId, 'Incidents', tabMonth))
    .filter((i) => asStr(i['shift_instance_id']) === shiftInstanceId && asStr(i['status']) !== 'batal');

  const catHits = await filterRows(spreadsheetId, 'IncidentCategories', () => true).catch(() => []);
  const incidentPointsMap = new Map<string, number>(catHits.map((c) => [asStr(c['id']), asNum(c['points']) || 0]));

  let totalIncidentPenalty = 0;
  for (const inc of incidents) {
    const catId = asStr(inc['category_id']);
    const pts = asNum(inc['points_snapshot']) || incidentPointsMap.get(catId) || 0;
    totalIncidentPenalty += pts;
  }

  // 3. Kalkulasi checklist available & earned (Cabang & Action)
  let totalChecklistWeight = 0;
  let checklistEarned = 0;
  const userActionEarned = new Map<string, number>();
  const userActionAvailable = new Map<string, number>();
  const userChecklistCount = new Map<string, number>();

  for (const [ptRef, baseW] of allPointsMap.entries()) {
    totalChecklistWeight += baseW;
    const entry = entries.find((e) => asStr(e['point_ref']) === ptRef);
    const worker = entry ? asStr(entry['completed_by']) : '';
    const state = entry ? asStr(entry['state']) : '';
    const outOfRange = entry ? asStr(entry['out_of_range']) === 'TRUE' : false;

    if (worker) {
      userActionAvailable.set(worker, (userActionAvailable.get(worker) || 0) + baseW);
    }

    const review = entry ? reviewByEntryId.get(asStr(entry['id'])) : null;
    let awarded = baseW;
    let isEarned = false;

    if (review) {
      const status = asStr(review['review_status']);
      if (status === 'valid') {
        isEarned = true;
        awarded = baseW;
      } else if (status === 'partial') {
        awarded = asNum(review['awarded_points']) ?? baseW;
        isEarned = awarded > 0;
      } else if (status === 'invalid') {
        awarded = 0;
        isEarned = false;
      } else {
        // pending
        isEarned = state === 'selesai' && !outOfRange;
        awarded = isEarned ? baseW : 0;
      }
    } else {
      isEarned = state === 'selesai' && !outOfRange;
      awarded = isEarned ? baseW : 0;
    }

    if (isEarned) {
      checklistEarned += awarded;
    }

    if (worker) {
      userActionEarned.set(worker, (userActionEarned.get(worker) || 0) + awarded);
      if (isEarned) {
        userChecklistCount.set(worker, (userChecklistCount.get(worker) || 0) + 1);
      }
    }
  }

  const branchEarned = Math.max(0, checklistEarned - totalIncidentPenalty);
  const branchAvailable = totalChecklistWeight > 0 ? totalChecklistWeight : 1;
  const branchScorePercent = Number(((branchEarned / branchAvailable) * 100).toFixed(2));

  // 4. ShiftPjAssignments & Rasio PJ. Sheet ini baru (Fase 18); shift lama
  // tanpa sheet/assignment memakai fallback pj_user_id (rasio 1).
  const pjAssignments = await filterRows(
    spreadsheetId,
    'ShiftPjAssignments',
    (r) => asStr(r['shift_instance_id']) === shiftInstanceId
  ).catch(() => []);
  const pjRatios = new Map<string, number>();
  if (pjAssignments.length > 0) {
    for (const pja of pjAssignments) {
      const uid = asStr(pja['user_id']);
      // Hitung durasi atau pakai rasio yang tersimpan / proporsi waktu
      const started = new Date(asStr(pja['started_at'])).getTime();
      const ended = asStr(pja['ended_at']) ? new Date(asStr(pja['ended_at'])).getTime() : Date.now();
      const duration = Math.max(1, ended - started);
      pjRatios.set(uid, (pjRatios.get(uid) || 0) + duration);
    }
    const totalDuration = Array.from(pjRatios.values()).reduce((a, b) => a + b, 0);
    if (totalDuration > 0) {
      for (const [uid, dur] of pjRatios.entries()) {
        pjRatios.set(uid, dur / totalDuration);
      }
    }
  } else {
    // Fallback pj_user_id dengan rasio 1.0
    const defaultPj = asStr(shift['pj_user_id']);
    if (defaultPj) {
      pjRatios.set(defaultPj, 1.0);
    }
  }

  const pjScores: Record<string, { available: number; earned: number; scorePercent: number; ratio: number }> = {};
  for (const [pjId, ratio] of pjRatios.entries()) {
    const pjAvailable = branchAvailable * ratio;
    const pjEarned = branchEarned * ratio;
    const pjPercent = pjAvailable > 0 ? Number(((pjEarned / pjAvailable) * 100).toFixed(2)) : 0;
    pjScores[pjId] = { available: pjAvailable, earned: pjEarned, scorePercent: pjPercent, ratio };
  }

  // 5. User Action Scores
  const userActionScores: Record<string, { available: number; earned: number; scorePercent: number }> = {};
  const allUsersSet = new Set<string>([...userActionEarned.keys(), ...pjRatios.keys()]);
  for (const uid of allUsersSet) {
    const actAvail = userActionAvailable.get(uid) || 0;
    const actEarned = userActionEarned.get(uid) || 0;
    const actPercent = actAvail > 0 ? Number(((actEarned / actAvail) * 100).toFixed(2)) : 0;
    userActionScores[uid] = { available: actAvail, earned: actEarned, scorePercent: actPercent };
  }

  // 6. User Total Scores = (pj_score * 50%) + (action_score * 50%)
  const userTotalScores: Record<string, {
    totalScore: number | null;
    pjScore: number | null;
    actionScore: number | null;
    pjShiftsCount: number;
    actionContributionsCount: number;
    branchesCount: number;
    checklistDoneCount: number;
    incidentPenalty: number;
  }> = {};

  for (const uid of allUsersSet) {
    const pjObj = pjScores[uid];
    const actObj = userActionScores[uid];
    const pjScoreVal = pjObj ? pjObj.scorePercent : null;
    const actScoreVal = actObj ? actObj.scorePercent : null;

    let totalScore: number | null = null;
    if (pjScoreVal !== null && actScoreVal !== null && pjObj?.ratio && actObj?.available > 0) {
      totalScore = Number(((pjScoreVal * 0.5) + (actScoreVal * 0.5)).toFixed(2));
    } else if (pjScoreVal !== null && pjObj?.ratio) {
      // Jika action belum tersedia tapi PJ ada
      totalScore = null; // Sesuai spec: "Jika satu dimensi belum tersedia, tampilkan Belum tersedia, bukan nol."
    }

    userTotalScores[uid] = {
      totalScore,
      pjScore: pjScoreVal,
      actionScore: actScoreVal,
      pjShiftsCount: pjObj ? 1 : 0,
      actionContributionsCount: actObj && actObj.earned > 0 ? 1 : 0,
      branchesCount: 1,
      checklistDoneCount: userChecklistCount.get(uid) || 0,
      incidentPenalty: incidents.filter((i) => asStr(i['reported_by']) === uid).reduce((acc, i) => acc + (asNum(i['points_snapshot']) || 0), 0),
    };
  }

  // 7. Simpan ke ScoreLedger — id dedup/deterministik per
  // (report_id, scope, subject, metric, score_version) sehingga retry tidak
  // menduplikasi baris, sedangkan koreksi review final menyegarkan nilainya.
  const writeLedgerRecord = async (
    scopeType: 'branch' | 'user',
    subjectId: string,
    metricType: 'branch' | 'pj' | 'action' | 'incident',
    pointsAvail: number,
    pointsEarned: number,
    penalty: number,
    finalPts: number,
    percent: number,
    ratio: number
  ) => {
    const id = deterministicId('sc', reportId, scopeType, subjectId, metricType, String(scoreVersion));
    const payload = {
      id,
      scope_type: scopeType,
      subject_id: subjectId,
      branch_id: branchId,
      shift_instance_id: shiftInstanceId,
      report_id: reportId,
      metric_type: metricType,
      score_version: scoreVersion,
      points_available: pointsAvail,
      points_earned: pointsEarned,
      incident_penalty: penalty,
      final_points: finalPts,
      score_percent: percent,
      attribution_ratio: ratio,
      calculated_at: getServerTime().toISOString(),
    };
    const existing = await findRow(spreadsheetId, 'ScoreLedger', 'id', id);
    const values = {
      points_available: pointsAvail,
      points_earned: pointsEarned,
      incident_penalty: penalty,
      final_points: finalPts,
      score_percent: percent,
      attribution_ratio: ratio,
      calculated_at: payload.calculated_at,
    };
    if (existing) {
      await updateRow(spreadsheetId, 'ScoreLedger', existing.rowNumber, values);
    } else {
      await insertRow(spreadsheetId, 'ScoreLedger', { ...payload, created_at: payload.calculated_at });
    }
  };

  // Branch ledger
  await writeLedgerRecord('branch', branchId, 'branch', totalChecklistWeight, checklistEarned, totalIncidentPenalty, branchEarned, branchScorePercent, 1.0);

  // PJ ledger
  for (const [pjId, pjObj] of Object.entries(pjScores)) {
    await writeLedgerRecord('user', pjId, 'pj', pjObj.available, pjObj.earned, totalIncidentPenalty * pjObj.ratio, pjObj.earned, pjObj.scorePercent, pjObj.ratio);
  }

  // Action ledger
  for (const [uid, actObj] of Object.entries(userActionScores)) {
    if (actObj.available > 0) {
      await writeLedgerRecord('user', uid, 'action', actObj.available, actObj.earned, 0, actObj.earned, actObj.scorePercent, 1.0);
    }
  }

  return {
    branchScore: {
      available: totalChecklistWeight,
      earned: checklistEarned,
      incidentPenalty: totalIncidentPenalty,
      finalPoints: branchEarned,
      scorePercent: branchScorePercent,
    },
    pjScores,
    userActionScores,
    userTotalScores,
  };
}
