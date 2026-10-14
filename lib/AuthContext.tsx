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
  mustChangePin: boolean;
}

type LoginResult =
  | { success: true; role: UserRole; mustChangePin: boolean }
  | { success: false; error: string };

/**
 * Status perpindahan sesi. Dipakai untuk menampilkan QuantumLoader overlay
 * selama proses login/logout berjalan, supaya pengguna tidak mengira tombolnya
 * tidak merespons — terutama saat menekan "Keluar", karena navbar tetap terlihat
 * sampai redirect selesai.
 *
 * 'idle'   — tidak ada transisi sesi
 * 'login'  — POST /api/auth/login sedang berjalan
 * 'logout' — POST /api/auth/logout sedang berjalan
 */
type AuthTransition = 'idle' | 'login' | 'logout';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Status transisi sesi saat ini; 'idle' bila tidak ada proses. */
  transition: AuthTransition;
  login: (username: string, pin: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /** Kembalikan status transisi ke 'idle' (dipakai overlay setelah redirect). */
  clearTransition: () => void;
  hasAnyRole: (roles: UserRole[]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Respon /api/auth/me & /api/auth/login: mendukung shape legacy { user } maupun { data }. */
function extractUser(json: unknown): User | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const data = (obj.data ?? obj.user ?? null) as
    | User
    | null;
  if (!data || typeof data !== 'object') return null;
  return {
    username: String(data.username ?? ''),
    nama: String(data.nama ?? ''),
    role: data.role === 'admin' ? 'admin' : 'petugas',
    cabangId: String(data.cabangId ?? ''),
    mustChangePin: data.mustChangePin === true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transition, setTransition] = useState<AuthTransition>('idle');

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

  const login = async (username: string, pin: string): Promise<LoginResult> => {
    setTransition('login');
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
        // Sengaja TIDAK reset ke 'idle' di sini. Pemanggil (halaman login)
        // akan me-redirect lewat window.location.assign; overlay dibiarkan
        // tampil sampai halaman baru benar-benar dimuat. Kalau redirect
        // gagal, AuthGuard akan mengembalikan state ke 'idle'.
        return { success: true, role: u.role, mustChangePin: u.mustChangePin };
      }
      const errMsg =
        (data?.error?.message as string | undefined) ??
        (typeof data?.error === 'string' ? (data.error as string) : undefined) ??
        'Username atau PIN salah';
      setTransition('idle');
      return { success: false, error: errMsg };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setTransition('idle');
      return { success: false, error: 'Gagal terhubung ke server: ' + message };
    }
  };

  const logout = async () => {
    setTransition('logout');
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Abaikan error logout, tetap clear state lokal
    }
    setUser(null);
    // State dibiarkan 'logout' sampai halaman login selesai dimuat.
  };

  const clearTransition = () => setTransition('idle');

  const hasAnyRole = (roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        transition,
        login,
        logout,
        clearTransition,
        hasAnyRole,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}