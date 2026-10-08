'use client';

// lib/CabangContext.tsx
// Pola disamakan dengan STOKIS: daftar cabang diambil sekali lalu dibagikan
// lewat context. Sebelumnya tiap halaman fetch /api/shifts ulang untuk daftar
// cabang yang sama — menyebabkan bacaan sheet berulang.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';

// Sesuai response GET /api/shifts.
export interface Cabang {
  id: string;
  name: string;
  code: string;
  timezone: string;
}

interface CabangContextType {
  branches: Cabang[];
  loading: boolean;
  refreshBranches: () => Promise<void>;
}

const CabangContext = createContext<CabangContextType>({
  branches: [],
  loading: true,
  refreshBranches: async () => {},
});

export function CabangProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Cabang[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const fetchIdRef = useRef(0);

  const fetchBranches = useCallback(async () => {
    const id = ++fetchIdRef.current;
    try {
      setLoading(true);
      const res = await fetch('/api/shifts', { headers: { 'X-Requested-With': 'fetch' } });
      const json = await res.json();
      if (id !== fetchIdRef.current) return;
      const list = (json?.branches ?? []) as Cabang[];
      if (Array.isArray(list)) setBranches(list);
    } catch {
      // State kosong, halaman menampilkan fallback tanpa cabang
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role]);

  return (
    <CabangContext.Provider
      value={{ branches, loading: authLoading || loading, refreshBranches: fetchBranches }}
    >
      {children}
    </CabangContext.Provider>
  );
}

export function useCabang() {
  return useContext(CabangContext);
}