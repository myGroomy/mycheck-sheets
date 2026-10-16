// lib/google/drive-permission-gas.ts
// Wrapper untuk action `revokePublicWrite` (Fase 0).
//
// Service account tidak bisa menghapus permission `anyone` yang diwarisi:
// Drive API menolak dengan "The authenticated user cannot delete the
// permission" meskipun role-nya writer. GAS berjalan sebagai owner, jadi
// hanya GAS yang bisa mencabut.
// Lihat apps-script/Code.gs handleRevokePublicWrite_.

import { callGas } from './gas-client';

export interface RevokeTargetResult {
  folderId: string;
  name: string | null;
  /** Jumlah permission publik yang berhasil dicabut. */
  revoked?: number;
  /** Permission publik yang masih tersisa setelah proses. */
  remainingPublic?: number;
  failed?: string[];
  error?: string;
}

export interface RevokePublicWriteOutput {
  results: RevokeTargetResult[];
  totalTargets: number;
  totalRemainingPublic: number;
}

export async function revokePublicWriteViaGas(
  folderIds?: string[]
): Promise<RevokePublicWriteOutput> {
  return callGas<RevokePublicWriteOutput>('revokePublicWrite', { folderIds }, 'admin');
}

/**
 * true bila semua target sudah bebas akses tulis publik.
 * Folder yang gagal dibaca ikut dianggap belum bersih agar fail closed.
 */
export function isFullyRevoked(output: RevokePublicWriteOutput): boolean {
  return output.results.every(
    (r) => !r.error && (r.remainingPublic ?? 0) === 0 && (!r.failed || r.failed.length === 0)
  );
}
