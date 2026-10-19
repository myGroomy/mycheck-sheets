'use client';

// components/report/share-report-button.tsx
// Tombol Bagikan laporan, mengikuti pola app stokis: Web Share API dengan
// fallback ke clipboard.
//
// POLICY (Fase 15 revisi) — SEMUA PENGGUNA DAPAT LINK PUBLIK
// Setiap petugas/admin yang berhak atas laporan bisa membagikannya ke
// WhatsApp setelah shift selesai, jadi tombol selalu membuat token publik
// lewat POST /api/admin/reports/[id]/share. Endpoint menegakkan akses cabang
// (bukan role), dan halaman /r/[token] tidak butuh login sehingga link bisa
// dikirim ke siapa saja. Revoke token tetap khusus admin.

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { QuantumLoaderMini } from '@/components/ui/QuantumLoader';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/admin/api';

export interface ShareReportButtonProps {
  reportId: string;
  /** Dipakai di teks share; mis. "R-20261014-TZ1F". */
  reportNumber: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  /** Masa berlaku link publik, jam. Default 720 (30 hari). */
  expiresHours?: number;
}

export function ShareReportButton({
  reportId,
  reportNumber,
  variant = 'outline',
  size = 'default',
  className,
  expiresHours = 720,
}: ShareReportButtonProps) {
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    setState('busy');
    setError(null);

    try {
      const origin = window.location.origin;

      // Semua role: buat token publik lalu bagikan link /r/<token>.
      const res = await apiFetch<{ token: string }>(
        `/api/admin/reports/${encodeURIComponent(reportId)}/share`,
        { method: 'POST', json: { expiresHours } }
      );
      if (!res?.token) throw new Error('Server tidak mengembalikan token share');
      const url = `${origin}/r/${encodeURIComponent(res.token)}`;
      const text = `Laporan shift ${reportNumber} sudah selesai. Lihat di:`;

      const shareData = { title: `Laporan ${reportNumber}`, text, url };

      // 1) Web Share API (Android/iOS/mobile). Kalau ada, ini yang dipakai.
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share(shareData);
          setState('idle');
          return;
        } catch (err) {
          // User menekan "Batal" — deliberate choice, jangan fallback.
          if ((err as Error)?.name === 'AbortError') {
            setState('idle');
            return;
          }
          // Share API gagal dengan alasan lain -> lanjut ke clipboard.
        }
      }

      // 2) Fallback: salin ke clipboard.
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setState('copied');
        setTimeout(() => setState('idle'), 2000);
        return;
      }

      // 3) Tidak ada clipboard API (browser sangat tua / non-secure context):
      //    tampilkan URL supaya user masih bisa menyalin manual.
      window.prompt('Salin tautan laporan berikut:', url);
      setState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat tautan bagikan';
      setError(message);
      setState('error');
      setTimeout(() => setState('idle'), 5000);
    }
  };

  const label = state === 'copied' ? 'Tersalin' : 'Bagikan';

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleShare}
        disabled={state === 'busy'}
        title="Buat link publik laporan lalu bagikan (WhatsApp, dll.)"
        aria-label={label}
      >
        {state === 'busy' ? (
          <>
            <QuantumLoaderMini className="text-current" />
            <span>Menyiapkan…</span>
          </>
        ) : state === 'copied' ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </>
        )}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
