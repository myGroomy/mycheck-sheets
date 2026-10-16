'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Lock, Timer } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { QuantumLoaderMini } from '@/components/ui/QuantumLoader';
import { PinInput } from '@/components/ui/pin-input';

// Kurva expo-out yang sama dengan halaman login STOKIS.
const EASE_EXPO = [0.16, 1, 0.3, 1] as [number, number, number, number];

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
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'wrong_pin' | 'user_not_found' | 'account_inactive' | 'network' | 'lockout' | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutRemaining(remaining);
      if (remaining <= 0 && lockoutTimerRef.current) {
        clearInterval(lockoutTimerRef.current);
        lockoutTimerRef.current = null;
        setLockoutUntil(null);
        setAttempts(0);
      }
    };
    updateRemaining();
    lockoutTimerRef.current = setInterval(updateRemaining, 1000);
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [lockoutUntil]);

  // Getar form saat kredensial ditolak — pola yang sama dengan STOKIS.
  const fail = useCallback((message: string) => {
    setError(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      fail('Username wajib diisi');
      return;
    }
    if (pin.length !== 6) {
      fail('PIN harus 6 digit angka');
      return;
    }

    // Client-side lockout check
    if (lockoutUntil && Date.now() < lockoutUntil) {
      setError(`Terlalu banyak percobaan. Coba lagi dalam ${lockoutRemaining} detik.`);
      setErrorType('lockout');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorType(null);

    try {
      const result = await login(username.trim(), pin);
      if (!result.success) {
        fail(result.error || 'Login gagal');
        setErrorType(result.code === 'WRONG_PIN' ? 'wrong_pin' : result.code === 'USER_NOT_FOUND' ? 'user_not_found' : result.code === 'ACCOUNT_INACTIVE' ? 'account_inactive' : 'network');
        setPin('');
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          setLockoutUntil(Date.now() + 5 * 60 * 1000); // 5 minutes
          setAttempts(0);
        }

        setLoading(false);
        return;
      }

      // Muat ulang agar halaman server memverifikasi cookie sesi yang baru diterbitkan.
      window.location.assign(from);
      // Jangan set loading=false di sini — biar tombol "Memproses..." tetap muncul sampai redirect
    } catch {
      fail('Terjadi kesalahan. Silakan coba lagi.');
      setLoading(false);
    }
  };

  return (
    <motion.form
      key={shake ? 'shake' : 'idle'}
      ref={formRef}
      onSubmit={handleSubmit}
      initial={{ opacity: 0, x: -8 }}
      animate={shake ? { opacity: 1, x: [-8, 8, -6, 6, -3, 3, 0] } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      {error && (
        <div
          role="alert"
          className={`mb-4 rounded-lg border p-3 text-xs font-medium ${
            errorType === 'lockout'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : errorType === 'user_not_found'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {errorType === 'lockout' ? (
              <Timer className="h-4 w-4 shrink-0" />
            ) : errorType === 'account_inactive' ? (
              <Lock className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{error}</span>
          </div>
          {errorType === 'lockout' && lockoutRemaining > 0 && (
            <p className="mt-1 text-2xs opacity-75">
              Coba lagi dalam {lockoutRemaining} detik
            </p>
          )}
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
          className="w-full h-12 rounded-lg border border-border bg-canvas px-3 text-sm text-ink text-center focus:border-ink focus:outline-none"
          required
        />
      </div>

      <div className="mb-5">
        <label htmlFor="pin" className="block text-xs font-medium text-ink-muted mb-2">
          PIN (6 Digit) <span className="text-red-500">*</span>
        </label>
        {/* 6 kotak, digit disamarkan, dan auto-submit saat lengkap. requestSubmit
            memakai handler onSubmit form yang sama, sehingga validasi dan lockout
            tetap lewat jalur yang sama persis seperti tombol Masuk. */}
        <PinInput
          id="pin"
          value={pin}
          onChange={setPin}
          onComplete={() => formRef.current?.requestSubmit()}
        />
      </div>

      <motion.button
        type="submit"
        disabled={loading}
        whileHover={loading ? undefined : { scale: 1.01 }}
        whileTap={loading ? undefined : { scale: 0.98 }}
        className="w-full h-12 rounded-lg bg-ink text-canvas font-semibold text-sm hover:bg-ink/90 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <>
            <QuantumLoaderMini className="text-canvas" />
            Memproses...
          </>
        ) : (
          'Masuk'
        )}
      </motion.button>
    </motion.form>
  );
}

export default function LoginPage() {
  return (
    <motion.main
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_EXPO }}
      className="relative flex min-h-dvh items-center justify-center bg-canvas text-ink"
    >
      {/* Kembali — sengaja DI LUAR block yang di-center.
          Kalau ikut di dalam flow, block jadi lebih tinggi dan form (bagian
          paling penting) terdorong ke bawah. Dipisah ke kiri atas dengan
          position absolute, jadi tidak menambah tinggi block. */}
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali
      </Link>

      {/* Tanpa padding atas yang besar: padding ikut menambah tinggi block
          yang di-center sehingga form terdorong ke bawah. Link "Kembali"
          sudah dipisah keluar (absolute) dan tidak menambah tinggi, jadi
          tidak perlu ruang tambahan di sini. */}
      <div className="relative w-full max-w-sm px-4">
        {/* Logo & Header */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE_EXPO }}
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-ink text-canvas"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="text-xl font-bold"
          >
            MyCheck
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mt-1 text-xs text-ink-muted"
          >
            Masuk untuk memulai shift Anda
          </motion.p>
        </div>

        {/* Jarak 24px header→form memakai mt-6 di sini (bukan mb-6 pada
            header) agar ikut terhitung dalam tinggi block yang di-center. */}
        <div className="mt-6">
          <Suspense
            fallback={
              <div className="flex justify-center py-6">
                <QuantumLoaderMini className="text-ink-muted" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>

      {/* Versi diposisikan absolut di bawah agar TIDAK ikut menambah tinggi
          block yang di-center. Kalau ikut di dalam flow, footer ini mendorong
          form ke bawah ~47px dari titik tengah layar. */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="absolute inset-x-0 bottom-4 text-center text-xs text-ink-light sm:bottom-6"
      >
        v2.0 Google Sheets
      </motion.p>
    </motion.main>
  );
}
