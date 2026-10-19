'use client';

// lib/working-branch.tsx
// Konteks "cabang kerja" untuk semua pengguna multi-cabang.
//
// LATAR BELAKANG
// lib/api-auth.ts memberi admin akses ke SELURUH cabang (branchIds = semua
// cabang aktif). Untuk petugas, branchIds adalah cabang penugasannya sehingga
// tidak ambigu. Untuk admin, `ctx.branchIds[0]` tidak berarti "cabang saya" —
// ia hanya cabang pertama secara alfabetis. Karena itu setiap aksi tulis
// sebagai petugas wajib menyebut cabang secara eksplisit.
//
// KONSEKUENSI TERHADAP MODEL AKSES
// `requireBranchAccess` tidak diubah: admin tetap boleh MEMBACA semua cabang
// (fungsi pengawasan). Yang digate di sini hanya aksi TULIS. Aksi tulis tidak
// pernah menebak cabang — kalau cabang tidak disebut, server menolak dengan 400.
//
// PERSISTENSI
// Cookie, bukan localStorage: cookie ikut terkirim ke server sehingga
// Server Component bisa membacanya dan render pertama sudah konsisten (tidak
// ada flicker "Memuat…" atau hydration mismatch tiap navigasi). Nilai awal
// dikirim dari app/layout.tsx sebagai `initialBranchId`.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useCabang } from './CabangContext';

export const WORKING_BRANCH_COOKIE = 'mycheck_working_branch';

// 90 hari. Cukup untuk satu siklus jadwal, dan cukup lama agar admin tidak
// perlu memilih ulang tiap kali. Itu pun lebih longgar dari session karena
// "cabang kerja" adalah preferensi perangkat, bukan rahasia.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function writeCookie(value: string): void {
  document.cookie = `${WORKING_BRANCH_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export interface WorkingBranchContextType {
  /** Cabang kerja aktif. `null` berarti belum memilih cabang. */
  branchId: string | null;
  setBranchId: (id: string) => void;
  isAdmin: boolean;
  /**
   * Guard defensif untuk form: cegah submit sebelum pengguna multi-cabang
   * memilih cabang. Pengguna dengan satu cabang otomatis memakai cabang itu.
   */
  requiresSelection: boolean;
}

const WorkingBranchContext = createContext<WorkingBranchContextType>({
  branchId: null,
  setBranchId: () => {},
  isAdmin: false,
  requiresSelection: false,
});

export function WorkingBranchProvider({
  initialBranchId,
  children,
}: {
  initialBranchId: string | null;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { branches } = useCabang();
  const isAdmin = user?.role === 'admin';
  const [branchId, setBranchIdState] = useState<string | null>(initialBranchId);

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id);
    writeCookie(id);
  }, []);

  // Cookie yang tidak valid tidak boleh diam-diam memilih cabang lain saat
  // pengguna memiliki lebih dari satu cabang.
  useEffect(() => {
    if (branches.length === 0) return;
    if (branchId && branches.some((b) => b.id === branchId)) return;

    if (branches.length === 1) {
      const onlyBranch = branches[0].id;
      setBranchIdState(onlyBranch);
      writeCookie(onlyBranch);
      return;
    }
    setBranchIdState(null);
  }, [branches, branchId]);

  const requiresSelection = branches.length > 1 && !branchId;

  return (
    <WorkingBranchContext.Provider value={{ branchId, setBranchId, isAdmin, requiresSelection }}>
      {children}
    </WorkingBranchContext.Provider>
  );
}

export function useWorkingBranch() {
  return useContext(WorkingBranchContext);
}
