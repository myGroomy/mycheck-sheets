'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

function LoginForm() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const requestedFrom = searchParams.get('from');
  const from =
    requestedFrom?.startsWith('/') &&
    !requestedFrom.startsWith('//') &&
    !requestedFrom.includes('\\') &&
    requestedFrom !== '/login'
      ? requestedFrom
      : '/daftar-shift';

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username wajib diisi');
      return;
    }
    if (pin.length !== 6) {
      setError('PIN harus 6 digit angka');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await login(username.trim(), pin);
      if (!result.success) {
        setError(result.error || 'Login gagal');
        setPin('');
        setLoading(false);
        return;
      }

      // Akun baru/reset harus mengganti PIN sebelum memakai aplikasi.
      if (result.mustChangePin) {
        window.location.assign('/ganti-pin');
      } else {
        // Muat ulang agar halaman server memverifikasi cookie sesi yang baru diterbitkan.
        window.location.assign(from);
      }
      // Jangan set loading=false di sini — biar tombol "Memproses..." tetap muncul sampai redirect
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="username" className="block text-xs font-medium text-ink-muted mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername((e.target as HTMLInputElement).value)}
          placeholder="Masukkan username"
          autoComplete="username"
          className="w-full h-12 rounded-lg border border-border bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none"
          required
        />
      </div>

      <div className="mb-5">
        <label htmlFor="pin" className="block text-xs font-medium text-ink-muted mb-2">
          PIN (6 Digit) <span className="text-red-500">*</span>
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
          autoComplete="current-password"
          placeholder="••••••"
          className="w-full h-12 rounded-lg border border-border bg-canvas px-3 text-center text-xl font-semibold text-ink tracking-[0.5em] placeholder:text-ink-light/30 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-12 rounded-lg bg-ink text-canvas font-semibold text-sm hover:bg-ink/90 transition-colors flex items-center justify-center"
      >
        {loading ? 'Memproses...' : 'Masuk'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 bg-canvas text-ink">
      <div className="w-full max-w-sm">
        {/* Kembali */}
        <Link
          href="/"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali
        </Link>

        {/* Logo & Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-ink text-canvas">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">MyCheck</h1>
          <p className="mt-1 text-xs text-ink-muted">Masuk untuk memulai shift Anda</p>
        </div>

        <Suspense fallback={<div className="text-center text-xs text-ink-muted">Memuat...</div>}>
          <LoginForm />
        </Suspense>

        <p className="mt-4 text-center text-xs text-ink-light">v2.0 Google Sheets</p>
      </div>
    </main>
  );
}
