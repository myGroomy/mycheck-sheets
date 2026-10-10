'use client';

// lib/AuthContext.tsx
// Pola disamakan 100% dengan STOKIS: auth user disimpan di React Context pada
// root, jadi tiap halaman tidak perlu memanggil getUser() lagi. Sesi global
// hidup selama provider tidak unmount.

import React, { createContext, useContext, useState, useEffect } from 'react';

type UserRole = 'admin' | 'petugas';

interface User {
  username: string;
  nama: string;
  role: UserRole;
  cabangId: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasAnyRole: (roles: UserRole[]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Respon /api/auth/me & /api/auth/login: mendukung shape legacy { user } maupun { data }. */
function extractUser(json: unknown): User | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const data = (obj.data ?? obj.user ?? null) as
    | (User & { mustChangePin?: boolean })
    | null;
  if (!data || typeof data !== 'object') return null;
  return {
    username: String(data.username ?? ''),
    nama: String(data.nama ?? ''),
    role: data.role === 'admin' ? 'admin' : 'petugas',
    cabangId: String(data.cabangId ?? ''),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ambil session dari server (httpOnly cookie) bukan localStorage.
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        const u = extractUser(data);
        if (u) setUser(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, pin: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ username, pin }),
      });
      const data = await res.json();
      const u = extractUser(data);
      if (res.ok && u) {
        setUser(u);
        return { success: true };
      }
      const errMsg =
        (data?.error?.message as string | undefined) ??
        (typeof data?.error === 'string' ? (data.error as string) : undefined) ??
        'Username atau PIN salah';
      return { success: false, error: errMsg };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: 'Gagal terhubung ke server: ' + message };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Abaikan error logout, tetap clear state lokal
    }
    setUser(null);
  };

  const hasAnyRole = (roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasAnyRole, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}