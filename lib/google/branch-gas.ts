// lib/google/branch-gas.ts
// Wrapper panggilan createBranchStructure ke GAS.

import { callGas } from './gas-client';

export interface CreateBranchStructureInput {
  branchCode: string;
  branchName: string;
}

export interface CreateBranchStructureOutput {
  branchFolderId: string;
  spreadsheetId: string;
  evidenceFolderId: string;
  reused: boolean;
}

export async function createBranchStructureViaGas(
  input: CreateBranchStructureInput
): Promise<CreateBranchStructureOutput> {
  return callGas<CreateBranchStructureOutput>(
    'createBranchStructure',
    {
      branchCode: input.branchCode,
      branchName: input.branchName,
    },
    'admin'
  );
}
