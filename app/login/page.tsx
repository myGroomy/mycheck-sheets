'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Lock, ShieldCheck, Timer } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { QuantumLoaderMini } from '@/components/ui/QuantumLoader';

const EASE_EXPO = [0.16, 1, 0.3, 1] as [number, number, number, number];
const PIN_LENGTH = 6;

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
  const [errorType, setErrorType] = useState<'wrong_pin' | 'user_not_found' | 'account_inactive' | 'network' | 'lockout' | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!loading) {
      const el = document.getElementById('login-username');
      el?.focus();
    }
  }, [loading]);

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

  const fail = useCallback((message: string) => {
    setError(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  }, []);

  const canSubmit = username.trim().length > 0 && pin.length === PIN_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      fail('Username wajib diisi');
      return;
    }
    if (pin.length !== PIN_LENGTH) {
      fail('PIN harus 6 digit angka');
      return;
    }

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
          setLockoutUntil(Date.now() + 5 * 60 * 1000);
          setAttempts(0);
        }

        setLoading(false);
        return;
      }

      window.location.assign(from);
    } catch {
      fail('Terjadi kesalahan. Silakan coba lagi.');
      setLoading(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={shake ? { opacity: 1, x: [-10, 10, -8, 8, -4, 4, 0] } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: EASE_EXPO }}
      className="relative rounded-3xl border border-white/10 bg-neutral-900/60 p-8 shadow-2xl backdrop-blur-2xl"
    >
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-xs font-medium ${
            errorType === 'lockout' || errorType === 'user_not_found'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-red-500/10 border-red-500/30 text-red-200'
          }`}
        >
          {errorType === 'lockout' ? (
            <Timer className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          ) : errorType === 'account_inactive' ? (
            <Lock className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          )}
          <div className="space-y-1">
            <p>{error}</p>
            {errorType === 'lockout' && lockoutRemaining > 0 && (
              <p className="text-[10px] text-amber-300/80">
                Coba lagi dalam {lockoutRemaining} detik
              </p>
            )}
          </div>
        </motion.div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="login-username" className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
            Username
          </label>
          <div className="relative">
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername((e.target as HTMLInputElement).value)}
              placeholder="Masukkan username anda"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              className="w-full h-13 rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder-neutral-500 focus:border-white/30 focus:bg-black/60 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="login-pin-0" className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
              PIN Keamanan <span className="text-red-400">*</span>
            </label>
            <span className="text-[11px] font-mono text-neutral-500">{pin.length}/{PIN_LENGTH} digit</span>
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <input
                key={i}
                id={`login-pin-${i}`}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck="false"
                disabled={loading}
                value={pin[i] ?? ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 1);
                  const next = pin.slice(0, i) + val + pin.slice(i + 1);
                  setPin(next);
                  if (val && i < PIN_LENGTH - 1) {
                    pinRefs.current[i + 1]?.focus();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace') {
                    if (pin[i]) {
                      const next = pin.slice(0, i) + '' + pin.slice(i + 1);
                      setPin(next);
                    } else if (i > 0) {
                      pinRefs.current[i - 1]?.focus();
                    }
                  } else if (e.key === 'ArrowLeft' && i > 0) {
                    pinRefs.current[i - 1]?.focus();
                  } else if (e.key === 'ArrowRight' && i < PIN_LENGTH - 1) {
                    pinRefs.current[i + 1]?.focus();
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
                  if (pasted) {
                    setPin(pasted);
                    pinRefs.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
                  }
                }}
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
                aria-invalid={Boolean(error)}
                className="w-full h-13 rounded-xl border border-white/10 bg-black/40 text-center text-lg font-mono tabular-nums text-white focus:border-white/40 focus:bg-black/70 focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-50 transition-all shadow-inner"
              />
            ))}
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={loading || !canSubmit}
          whileHover={loading || !canSubmit ? undefined : { scale: 1.015 }}
          whileTap={loading || !canSubmit ? undefined : { scale: 0.985 }}
          className={`w-full h-13 mt-3 rounded-xl bg-white text-neutral-950 font-semibold text-sm tracking-wide shadow-lg hover:bg-neutral-100 transition-all flex items-center justify-center gap-2.5 disabled:cursor-not-allowed disabled:opacity-40 ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? (
            <>
              <QuantumLoaderMini className="text-neutral-950" />
              <span>Memproses Otorisasi...</span>
            </>
          ) : (
            <span>Masuk ke Sistem</span>
          )}
        </motion.button>
      </div>
    </motion.form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-neutral-950 text-white flex items-center justify-center antialiased">
      {/* Background with requested transparent/ambient Unsplash image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-35 mix-blend-luminosity filter contrast-125 scale-105 transition-transform duration-1000"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1518976024611-28bf4b48222e?w=1920&auto=format&fit=crop&q=80')` }}
      />
      {/* Sophisticated dark radial gradient vignette overlay */}
      <div className="absolute inset-0 bg-radial from-neutral-950/20 via-neutral-950/80 to-neutral-950 pointer-events-none" />
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none" />

      {/* Top Left Back Navigation */}
      <Link
        href="/"
        className="absolute left-6 top-6 z-20 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-neutral-300 backdrop-blur-xl transition-all hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Beranda</span>
      </Link>

      {/* Main Center Content Container */}
      <div className="relative z-10 w-full max-w-md px-4 py-12">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_EXPO }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-xl"
          >
            <ShieldCheck className="h-8 w-8 text-white/90" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE_EXPO }}
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            MyCheck Enterprise
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: EASE_EXPO }}
            className="mt-2 text-xs text-neutral-400 tracking-wide uppercase"
          >
            Otorisasi Shift &amp; Operasional Cabang
          </motion.p>
        </div>

        <LoginForm />
      </div>

      {/* Bottom Footer Version */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="absolute bottom-6 inset-x-0 text-center z-10"
      >
        <p className="text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
          Secured Architecture &middot; v2.0 Google Sheets Engine
        </p>
      </motion.div>
    </main>
  );
}
