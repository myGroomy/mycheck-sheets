// lib/instance-resolver.ts
// Cari shift instance berdasarkan ID di semua cabang yang bisa diakses user.
import { AuthContext } from './api-auth';
import { listRowsWithNumber } from './store';
import { resolveCabang } from './google/registry';
import { tabMonthOfDate } from './schema/periods';

const BRANCH_LOOKUP_CONCURRENCY = 3;

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
  return tabMonthOfDate();
}

export async function resolveInstance(
  ctx: AuthContext,
  shiftInstanceId: string
): Promise<ResolvedInstance | null> {
  for (let offset = 0; offset < ctx.branchIds.length; offset += BRANCH_LOOKUP_CONCURRENCY) {
    const branchBatch = ctx.branchIds.slice(offset, offset + BRANCH_LOOKUP_CONCURRENCY);
    const resolved = await Promise.all(branchBatch.map(async (cabangId) => {
      try {
        const { spreadsheetId, cabang } = await resolveCabang(cabangId);
        const rows = await listRowsWithNumber(spreadsheetId, 'ShiftInstances');
        const matches = rows.filter((r) => String(r.data['id'] ?? '') === shiftInstanceId);
        if (matches.length === 0) return null;

        // Bisa ada >1 baris dengan ID sama: shift yang di-void lalu dibuka
        // kembali memakai kunci logis yang sama. Yang benar adalah baris
        // non-void; kalau semuanya void, ambil yang terakhir ditulis.
        const active = matches.filter((r) => String(r.data['status'] ?? '') !== 'void');
        const picked = active.length > 0 ? active[active.length - 1] : matches[matches.length - 1];
        const tabMonth = tabMonthOf(picked.data);
        return {
          instance: picked.data,
          rowNumber: picked.rowNumber,
          spreadsheetId,
          branchId: cabangId,
          branchTimezone: (cabang['Timezone'] as string) || 'Asia/Jakarta',
          tabMonth,
        };
      } catch {
        return null;
      }
    }));
    const match = resolved.find((item) => item !== null);
    if (match) return match;
  }
  return null;
}
