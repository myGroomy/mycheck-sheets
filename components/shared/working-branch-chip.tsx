'use client';

import { Building2 } from 'lucide-react';
import { useWorkingBranch } from '@/lib/working-branch';
import { useCabang } from '@/lib/CabangContext';

export function WorkingBranchChip() {
  const { branchId, isAdmin } = useWorkingBranch();
  const { branches } = useCabang();

  if (!isAdmin) return null;

  const currentBranch = branches.find((b) => b.id === branchId);

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-1 text-xs font-medium text-ink">
      <Building2 className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
      <span>Cabang: <strong>{currentBranch?.name ?? branchId ?? '—'}</strong></span>
    </div>
  );
}
