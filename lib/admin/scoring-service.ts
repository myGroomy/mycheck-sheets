// lib/admin/scoring-service.ts
import { getCabangList, resolveCabang } from '../google/registry';
import { filterRows, asStr, asNum } from '../store';

export interface ScoreFilter {
  branchId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  shiftDefinitionId?: string;
  metricType?: string;
}

export async function queryScoreLedger(filter: ScoreFilter, allowedBranchIds: string[]) {
  const cabangs = await getCabangList();
  const targetBranches = filter.branchId
    ? cabangs.filter((c) => c.Cabang_ID === filter.branchId && allowedBranchIds.includes(c.Cabang_ID))
    : cabangs.filter((c) => allowedBranchIds.includes(c.Cabang_ID));

  const allLedgerRows: Record<string, unknown>[] = [];

  for (const cabang of targetBranches) {
    if (!cabang.Spreadsheet_ID) continue;
    try {
      const { spreadsheetId } = await resolveCabang(cabang.Cabang_ID);
      const rows = await filterRows(spreadsheetId, 'ScoreLedger', (r) => {
        if (filter.userId && asStr(r['subject_id']) !== filter.userId) return false;
        if (filter.metricType && asStr(r['metric_type']) !== filter.metricType) return false;
        return true;
      });
      allLedgerRows.push(...rows);
    } catch {
      // lanjut
    }
  }

  return allLedgerRows;
}

export async function getBranchScoresSummary(filter: ScoreFilter, allowedBranchIds: string[]) {
  const ledger = await queryScoreLedger(filter, allowedBranchIds);
  const branchRows = ledger.filter((r) => asStr(r['scope_type']) === 'branch' && asStr(r['metric_type']) === 'branch');

  const grouped = new Map<string, { branchId: string; totalAvailable: number; totalEarned: number; count: number; scores: number[] }>();

  for (const row of branchRows) {
    const bId = asStr(row['branch_id']);
    if (filter.branchId && filter.branchId !== bId) continue;
    
    const curr = grouped.get(bId) || { branchId: bId, totalAvailable: 0, totalEarned: 0, count: 0, scores: [] };
    curr.totalAvailable += asNum(row['points_available']) || 0;
    curr.totalEarned += asNum(row['final_points']) || 0;
    curr.count += 1;
    curr.scores.push(asNum(row['score_percent']) || 0);
    grouped.set(bId, curr);
  }

  const results = Array.from(grouped.values()).map((g) => {
    const avgScore = g.scores.length > 0 ? Number((g.scores.reduce((a, b) => a + b, 0) / g.scores.length).toFixed(2)) : 0;
    const weightedScore = g.totalAvailable > 0 ? Number(((g.totalEarned / g.totalAvailable) * 100).toFixed(2)) : 0;
    return {
      branchId: g.branchId,
      shiftsCompleted: g.count,
      weightedScore,
      averageScore: avgScore,
    };
  });

  return results;
}

export async function getUserScoresSummary(filter: ScoreFilter, allowedBranchIds: string[]) {
  const ledger = await queryScoreLedger(filter, allowedBranchIds);
  const userRows = ledger.filter((r) => asStr(r['scope_type']) === 'user');

  const userMap = new Map<string, { userId: string; pjScores: number[]; actionScores: number[]; shiftsPj: number; contributions: number; penalties: number }>();

  for (const row of userRows) {
    const uId = asStr(row['subject_id']);
    if (filter.userId && filter.userId !== uId) continue;

    const curr = userMap.get(uId) || { userId: uId, pjScores: [], actionScores: [], shiftsPj: 0, contributions: 0, penalties: 0 };
    const mType = asStr(row['metric_type']);
    const percent = asNum(row['score_percent']) || 0;

    if (mType === 'pj') {
      curr.pjScores.push(percent);
      curr.shiftsPj += 1;
    } else if (mType === 'action') {
      curr.actionScores.push(percent);
      curr.contributions += 1;
    }
    curr.penalties += asNum(row['incident_penalty']) || 0;
    userMap.set(uId, curr);
  }

  const results = Array.from(userMap.values()).map((u) => {
    const avgPj = u.pjScores.length > 0 ? u.pjScores.reduce((a, b) => a + b, 0) / u.pjScores.length : null;
    const avgAction = u.actionScores.length > 0 ? u.actionScores.reduce((a, b) => a + b, 0) / u.actionScores.length : null;

    let totalScore: number | null = null;
    if (avgPj !== null && avgAction !== null) {
      totalScore = Number(((avgPj * 0.5) + (avgAction * 0.5)).toFixed(2));
    }

    return {
      userId: u.userId,
      pjScore: avgPj !== null ? Number(avgPj.toFixed(2)) : null,
      actionScore: avgAction !== null ? Number(avgAction.toFixed(2)) : null,
      userTotalScore: totalScore,
      shiftsPjCount: u.shiftsPj,
      actionContributionsCount: u.contributions,
      incidentPenaltyTotal: u.penalties,
    };
  });

  return results;
}
