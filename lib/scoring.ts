export type ScoreSeverity = 'none' | 'rendah' | 'sedang' | 'tinggi';

export interface ScoringPoint {
  pointRef: string;
  points?: number;
  state?: string;
  outOfRange?: boolean;
}

export interface ScoringIncident {
  points?: number;
  severity?: string | null;
  penaltyMinSeverity?: string | null;
}

export interface ScoreResult {
  available: number;
  earned: number;
  completionPercent: number;
  incidentPenalty: number;
  finalScore: number;
  scorePercent: number;
}

const severityRank: Record<ScoreSeverity, number> = { none: 0, rendah: 1, sedang: 2, tinggi: 3 };

function severity(value: unknown): ScoreSeverity {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'low') return 'rendah';
  if (normalized === 'medium') return 'sedang';
  if (normalized === 'high') return 'tinggi';
  return normalized in severityRank ? normalized as ScoreSeverity : 'none';
}

function points(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export function calculateScore(items: ScoringPoint[], incidents: ScoringIncident[] = []): ScoreResult {
  const available = items.reduce((total, item) => total + points(item.points, 1), 0);
  const earned = items.reduce((total, item) => {
    const weight = points(item.points, 1);
    return total + (item.state === 'selesai' && !item.outOfRange ? weight : 0);
  }, 0);
  const incidentPenalty = incidents.reduce((total, incident) => {
    const threshold = severity(incident.penaltyMinSeverity);
    const actual = severity(incident.severity);
    return total + (threshold !== 'none' && severityRank[actual] >= severityRank[threshold]
      ? points(incident.points)
      : 0);
  }, 0);
  const finalScore = Math.max(0, earned - incidentPenalty);
  const percent = (value: number) => available > 0 ? Number(((value / available) * 100).toFixed(2)) : 0;
  return {
    available,
    earned,
    completionPercent: percent(earned),
    incidentPenalty,
    finalScore,
    scorePercent: percent(finalScore),
  };
}
