import type { PeriodMode } from './registry';

function localParts(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function tabMonthOfDate(date: Date = new Date(), timezone = 'Asia/Jakarta'): string {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}`;
}

export function tabYearOfDate(date: Date = new Date(), timezone = 'Asia/Jakarta'): string {
  return localParts(date, timezone).year;
}

export function periodOf(date: Date = new Date(), timezone = 'Asia/Jakarta'): { tabMonth: string; tabYear: string } {
  const parts = localParts(date, timezone);
  return { tabMonth: `${parts.year}-${parts.month}`, tabYear: parts.year };
}

export function periodSheetPeriod(tabMonth: string, mode: PeriodMode): string {
  if (mode === 'flat') return '';
  return mode === 'yearly' ? tabMonth.slice(0, 4) : tabMonth.slice(0, 7);
}

export function isTabMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

export function isTabYear(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

export function monthsInYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
}
