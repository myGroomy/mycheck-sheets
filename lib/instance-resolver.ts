// lib/instance-resolver.ts
// Cari shift instance berdasarkan ID di semua cabang yang bisa diakses user.
import { AuthContext } from './api-auth';
import { findRow } from './store';
import { resolveCabang } from './google/registry';

export interface ResolvedInstance {
  instance: Record<string, unknown>;
  rowNumber: number;
  spreadsheetId: string;
  branchId: string;
  branchTimezone: string;
  tabMonth: string;
}

/** Tab bulan (YYYY-MM) dari baris ShiftInstances; fallback ke shift_date, lalu ke bulan berjalan. */
export function tabMonthOf(instance: Record<string, unknown>): string {
  const candidates = [
    String(instance['tab_month'] ?? '').trim(),
    String(instance['shift_date'] ?? '').trim().slice(0, 7),
  ];
  for (const c of candidates) {
    if (/^\d{4}-\d{2}$/.test(c)) return c;
  }
  return new Date().toISOString().slice(0, 7);
}

export async function resolveInstance(
  ctx: AuthContext,
  shiftInstanceId: string
): Promise<ResolvedInstance | null> {
  for (const cabangId of ctx.branchIds) {
    try {
      const { spreadsheetId, cabang } = await resolveCabang(cabangId);
      const row = await findRow(spreadsheetId, 'ShiftInstances', 'id', shiftInstanceId);
      if (row) {
        const tabMonth = tabMonthOf(row.data);
        return {
          instance: row.data,
          rowNumber: row.rowNumber,
          spreadsheetId,
          branchId: cabangId,
          branchTimezone: (cabang['Timezone'] as string) || 'Asia/Jakarta',
          tabMonth,
        };
      }
    } catch {
      // lanjut
    }
  }
  return null;
}
