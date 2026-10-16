// tests/helpers/mock-registry.ts
// Registry (Daftar_Cabang) sebagai sheet di workbook yang sama dengan fake
// Sheets client, supaya `resolveCabang` / `getCabangList` bisa dipakai.
//
// HARUS diimpor setelah `tests/helpers/mock-sheets` supaya fake Sheets client
// sudah terpasang. Import ini juga memasang env minimal yang dibaca registry.

import { addSheet, useWorkbook } from './mock-sheets';


export const REGISTRY_SPREADSHEET_ID = 'registry-uji';
export const BRANCH_SPREADSHEET_PREFIX = 'branch-';

/** Id spreadsheet milik satu cabang, sama dengan Spreadsheet_ID di registry. */
export function branchSpreadsheetId(branchId: string): string {
  return `${BRANCH_SPREADSHEET_PREFIX}${branchId}`;
}

export const CABANG_HEADERS = [
  'Cabang_ID',
  'Nama_Cabang',
  'Kode',
  'Timezone',
  'Spreadsheet_ID',
  'Folder_Drive_ID',
  'Aktif',
  'Alamat',
  'Branch_Folder_ID',
  'Evidence_Folder_ID',
  'Created_At',
];

export interface FakeBranch {
  id: string;
  name: string;
  code?: string;
  timezone?: string;
  active?: boolean;
  spreadsheetId?: string | null;
  branchFolderId?: string;
  evidenceFolderId?: string;
}

/**
 * Buat workbook baru + sheet Registry berisi daftar cabang.
 * Mengembalikan workbook agar test bisa menambah sheet konfigurasi cabang.
 */
export function seedRegistry(branches: FakeBranch[]): ReturnType<typeof useWorkbook>['workbook'] {
  const { workbook } = useWorkbook();

  addSheet(
    workbook,
    'Daftar_Cabang',
    CABANG_HEADERS,
    branches.map((branch) => ({
      Cabang_ID: branch.id,
      Nama_Cabang: branch.name,
      Kode: branch.code ?? branch.id,
      Timezone: branch.timezone ?? 'Asia/Jakarta',
      Spreadsheet_ID: branch.spreadsheetId ?? branchSpreadsheetId(branch.id),
      Folder_Drive_ID: 'folder-uji',
      Aktif: branch.active ?? true,
      Alamat: '',
      Branch_Folder_ID: branch.branchFolderId ?? '',
      Evidence_Folder_ID: branch.evidenceFolderId ?? '',
      Created_At: '2026-01-01T00:00:00.000Z',
    })),
    REGISTRY_SPREADSHEET_ID
  );

  return workbook;
}

/**
 * Sheet milik spreadsheet cabang. Tanpa ini semua cabang berbagi tab yang
 * sama di dalam workbook test, padahal spreadsheet Sheets sungguhan terisolasi.
 */
export function addBranchSheet(
  workbook: ReturnType<typeof useWorkbook>['workbook'],
  branchId: string,
  title: string,
  headers: string[],
  rows: Record<string, unknown>[] = []
) {
  return addSheet(workbook, title, headers, rows, branchSpreadsheetId(branchId));
}

/**
 * Buang cache daftar cabang/cabang resolve supaya test tidak saling bocor.
 * Cache registry punya TTL sehingga satu test bisa membaca cabang dari test
 * sebelumnya bila tidak di-reset.
 */
export function resetRegistryCache(): void {
  require('../../lib/google/registry').resetRegistryCache();
}