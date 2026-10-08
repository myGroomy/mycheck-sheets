// lib/branch.ts
// Helper resolusi cabang: spreadsheetId, folderId, timezone.
import { resolveCabang } from './google/registry';

export interface BranchContext {
  cabangId: string;
  spreadsheetId: string;
  folderId: string;
  timezone: string;
  name: string;
  code: string;
}

export async function getBranchContext(cabangId: string): Promise<BranchContext> {
  const { spreadsheetId, folderId, cabang } = await resolveCabang(cabangId);
  return {
    cabangId,
    spreadsheetId,
    folderId,
    timezone: (cabang['Timezone'] as string) || 'Asia/Jakarta',
    name: (cabang['Nama_Cabang'] as string) || cabangId,
    code: (cabang['Kode'] as string) || cabangId,
  };
}
