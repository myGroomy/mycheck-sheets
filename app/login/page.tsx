'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Lock, ShieldCheck, Timer } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { QuantumLoaderMini } from '@/components/ui/QuantumLoader';

const EASE_EXPO = [0.16, 1, 0.3, 1] as [number, number, number, number];
const PIN_LENGTH = 6;

function LoginForm() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const reduceMotion = useReducedMotion();
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

      window.location.assign(result.requiresSetup ? '/setup-akun' : from);
    } catch {
      fail('Terjadi kesalahan. Silakan coba lagi.');
      setLoading(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={false}
      animate={shake && !reduceMotion ? { opacity: 1, x: [-10, 10, -8, 8, -4, 4, 0] } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: EASE_EXPO }}
      className="relative rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-7"
    >
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className={`mb-6 flex items-start gap-3 rounded-lg border p-3 text-sm font-medium ${
            errorType === 'lockout' || errorType === 'user_not_found'
              ? 'border-warning/30 bg-warning-bg text-amber-900'
              : 'border-error/30 bg-error-bg text-red-900'
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
              <p className="text-xs text-amber-300/80">
                Coba lagi dalam {lockoutRemaining} detik
              </p>
            )}
          </div>
        </motion.div>
      )}

      <div className="space-y-5">
        <div>
            <label htmlFor="login-username" className="mb-2 block text-sm font-medium text-ink">
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
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-ink placeholder:text-ink-muted focus:border-ink-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="login-pin-0" className="block text-sm font-medium text-ink">
              PIN Keamanan <span className="text-red-400">*</span>
            </label>
            <span className="text-xs font-mono text-ink-muted">{pin.length}/{PIN_LENGTH} digit</span>
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
                className="min-h-14 w-full rounded-md border border-border bg-background text-center text-lg font-mono tabular-nums text-ink shadow-sm focus:border-ink-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 transition-colors"
              />
            ))}
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={loading || !canSubmit}
          whileHover={loading || !canSubmit ? undefined : { scale: 1.015 }}
          whileTap={loading || !canSubmit ? undefined : { scale: 0.985 }}
          className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2.5 rounded-md bg-primary text-sm font-semibold tracking-wide text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${!canSubmit ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {loading ? (
            <>
              <QuantumLoaderMini className="text-primary-foreground" />
              <span>Memproses…</span>
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
  const reduceMotion = useReducedMotion();
  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center overflow-y-auto bg-canvas px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-20 text-ink antialiased sm:py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <motion.div
            initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_EXPO }}
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface text-ink shadow-sm"
          >
            <ShieldCheck className="h-7 w-7 text-ink" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE_EXPO }}
            className="text-2xl font-bold tracking-tight text-ink sm:text-3xl"
          >
            MyCheck Enterprise
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: EASE_EXPO }}
            className="mt-2 text-xs uppercase tracking-wide text-ink-muted"
          >
            Otorisasi Shift &amp; Operasional Cabang
          </motion.p>
        </div>

        <LoginForm />
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-6 text-center"
      >
        <p className="text-xs font-mono uppercase tracking-wider text-ink-muted">
          MyCheck · Operasional cabang
        </p>
      </motion.div>
    </main>
  );
}
