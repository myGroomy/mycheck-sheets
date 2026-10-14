'use client';

// lib/CabangContext.tsx
// Pola disamakan dengan STOKIS: daftar cabang diambil sekali lalu dibagikan
// lewat context. Sebelumnya tiap halaman fetch /api/shifts ulang untuk daftar
// cabang yang sama menyebabkan bacaan sheet berulang.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';

const BRANCH_DATA_MAX_AGE_MS = 30_000;

// Sesuai response GET /api/shifts.
export interface Cabang {
  id: string;
  name: string;
  code: string;
  timezone: string;
}

export interface ShiftSummary {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  sortOrder: number;
  timezone: string;
  today: string;
  instance: {
    shift_instance_id: string;
    status: 'berjalan' | 'ditutup' | 'ditutup_paksa' | 'void';
    pj_user_id: string | null;
    opened_outside_hours?: boolean;
  } | null;
}

interface CabangContextType {
  branches: Cabang[];
  shifts: ShiftSummary[];
  loading: boolean;
  error: string | null;
  refreshBranches: () => Promise<void>;
  refreshBranchesIfStale: () => Promise<void>;
}

const CabangContext = createContext<CabangContextType>({
  branches: [],
  shifts: [],
  loading: true,
  error: null,
  refreshBranches: async () => {},
  refreshBranchesIfStale: async () => {},
});

export function CabangProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Cabang[]>([]);
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);
  const fetchedAtRef = useRef(0);

  const fetchBranches = useCallback(async () => {
    const id = ++fetchIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/shifts', {
        headers: { 'X-Requested-With': 'fetch' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Gagal memuat daftar shift');
      const json = await res.json() as {
        branches?: Cabang[];
        shifts?: ShiftSummary[];
      };
      if (id !== fetchIdRef.current) return;
      if (!Array.isArray(json.branches) || !Array.isArray(json.shifts)) {
        throw new Error('Data daftar shift tidak valid');
      }
      setBranches(json.branches);
      setShifts(json.shifts);
      fetchedAtRef.current = Date.now();
    } catch (err) {
      if (id === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : 'Gagal memuat daftar shift');
      }
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, []);

  const refreshBranchesIfStale = useCallback(async () => {
    if (Date.now() - fetchedAtRef.current >= BRANCH_DATA_MAX_AGE_MS) {
      await fetchBranches();
    }
  }, [fetchBranches]);

  useEffect(() => {
    if (authLoading) return;
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role]);

  return (
    <CabangContext.Provider
      value={{
        branches,
        shifts,
        loading: authLoading || loading,
        error,
        refreshBranches: fetchBranches,
        refreshBranchesIfStale,
      }}
    >
      {children}
    </CabangContext.Provider>
  );
}

export function useCabang() {
  return useContext(CabangContext);
}