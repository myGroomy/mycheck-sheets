export type CleanupSheet = { sheetId: number; title: string };

export function legacyDate(title: string): Date | null {
  const match = title.match(/^LEGACY_(\d{4})[-]?(\d{2})[-]?(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function cleanupCandidates(sheets: CleanupSheet[], cutoff: Date): { remove: CleanupSheet[]; skipped: CleanupSheet[] } {
  const remove: CleanupSheet[] = [];
  const skipped: CleanupSheet[] = [];
  for (const sheet of sheets) {
    if (sheet.title === 'Summary' || sheet.title === 'Snapshots') {
      remove.push(sheet);
      continue;
    }
    if (sheet.title.startsWith('LEGACY_')) {
      const date = legacyDate(sheet.title);
      if (date && date < cutoff) remove.push(sheet);
      else skipped.push(sheet);
    }
  }
  return { remove, skipped };
}
