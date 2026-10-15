'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';

export default function GantiPinPage() {
  const router = useRouter();

  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Auto-redirect 2 detik setelah sukses
  useEffect(() => {
    if (!success) return;

    setCountdown(2);
    redirectTimerRef.current = setTimeout(() => {
      router.push('/');
    }, 2000);

    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      clearInterval(interval);
    };
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (oldPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6) {
      setError('Setiap PIN harus terdiri dari 6 angka');
      return;
    }

    if (newPin !== confirmPin) {
      setError('PIN baru dan Konfirmasi PIN tidak cocok');
      return;
    }

    if (oldPin === newPin) {
      setError('PIN baru harus berbeda dari PIN lama');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ oldPin, newPin, confirmPin }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error || 'Gagal mengubah PIN');
        return;
      }

      setSuccess('PIN berhasil diperbarui.');
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 bg-canvas text-ink">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">Ganti PIN</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Perbarui PIN Anda untuk menjaga keamanan akun
          </p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {success} Alih ke beranda dalam {countdown} detik...
              </span>
            </div>
          )}

          <div>
            <label htmlFor="oldPin" className="block text-xs font-medium text-ink-muted mb-1">
              PIN Lama / Awal (6 Digit) <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="oldPin"
              inputMode="numeric"
              maxLength={6}
              value={oldPin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOldPin(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="h-12 text-center text-lg tracking-widest font-bold"
              required
            />
          </div>

          <div>
            <label htmlFor="newPin" className="block text-xs font-medium text-ink-muted mb-1">
              PIN Baru (6 Digit) <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="newPin"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="======="
              className="h-12 text-center text-lg tracking-widest font-bold"
              required
            />
            <p className="mt-1 text-2xs text-ink-light">
              Gunakan 6 angka yang tidak mudah ditebak (bukan 123456/111111)
            </p>
          </div>

          <div>
            <label htmlFor="confirmPin" className="block text-xs font-medium text-ink-muted mb-1">
              Konfirmasi PIN Baru <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="confirmPin"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="======="
              className="h-12 text-center text-lg tracking-widest font-bold"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || oldPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6}
            className="w-full h-12 rounded-lg bg-ink text-canvas font-semibold text-sm disabled:opacity-50 transition-opacity flex items-center justify-center mt-2"
          >
            {loading ? 'Memperbarui...' : 'Simpan PIN Baru'}
          </button>
        </form>
      </div>
    </main>
  );
}
