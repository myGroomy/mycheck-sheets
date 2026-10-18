'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

export default function SetupAkunPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !user.requiresSetup) router.replace(user.role === 'admin' ? '/admin' : '/daftar-shift');
  }, [loading, router, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (username.trim().length < 3) return setError('Username minimal 3 karakter.');
    if (!/^\d{6}$/.test(newPin)) return setError('PIN baru harus 6 digit angka.');
    if (newPin !== confirmPin) return setError('Konfirmasi PIN tidak cocok.');

    setSaving(true);
    try {
      const response = await fetch('/api/auth/bootstrap-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ username: username.trim(), newPin, confirmPin }),
      });
      const data = (await response.json()) as { error?: string; user?: { role?: string } };
      if (!response.ok) throw new Error(data.error || 'Setup akun gagal.');
      window.location.assign(data.user?.role === 'admin' ? '/admin' : '/daftar-shift');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Setup akun gagal.');
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Siapkan akun admin</h1>
            <p className="mt-1 text-sm text-ink-muted">Ganti username dan PIN awal sebelum memakai aplikasi.</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-error-bg p-3 text-sm text-error">{error}</div>}
          <div className="space-y-1">
            <Label htmlFor="setup-username">Username baru</Label>
            <Input id="setup-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" disabled={saving} />
            <p className="text-xs text-ink-muted">Gunakan 3–40 karakter: huruf, angka, titik, strip, atau underscore.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="setup-pin">PIN baru</Label>
            <Input id="setup-pin" type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ''))} autoComplete="new-password" disabled={saving} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="setup-confirm-pin">Konfirmasi PIN baru</Label>
            <Input id="setup-confirm-pin" type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))} autoComplete="new-password" disabled={saving} />
          </div>
          <Button className="w-full" type="submit" disabled={saving || loading}>
            {saving ? 'Menyimpan...' : 'Simpan dan masuk'}
          </Button>
        </form>
      </section>
    </main>
  );
}
