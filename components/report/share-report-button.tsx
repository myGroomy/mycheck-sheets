'use client';

// components/report/share-report-button.tsx
// Tombol Bagikan laporan, mengikuti pola app stokis: Web Share API dengan
// fallback ke clipboard.
//
// PERBEDAAN PENTING DARI STOKIS — LINK BERGANTUNG ROLE
// Di MyCheck "share" berarti dua hal yang berbeda, jadi URL-nya ikut role:
//
//   admin   -> link PUBLIK  /r/<token>
//             Token dibuat lewat POST /api/admin/reports/[id]/share, yang
//             MEbutuh role admin. Halaman /r/[token] tidak butuh login, jadi
//             link ini bisa dikirim ke siapa saja (stok opname/keluarga).
//
//   petugas -> link APLIKASI /report/<id>
//             Endpoint share di atas menolak petugas (403). Daripada
//             menampilkan tombol yang selalu gagal, petugas mendapat link
//             yang butuh login — berguna untuk kirim ke rekan satu cabang
//             yang memang punya akun.
//
// Alasan tidak murni teknikal: membuat token publik berarti data shift bisa
// dibuka publik. Itu keputusan admin, bukan petugas, sehingga tidak
// otomatis diberikan ke petugas.

import { useState } from 'react';
import { Check, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/admin/api';
import { useAuth } from '@/lib/AuthContext';

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

/** Susun teks share yang enak dibaca di WhatsApp. */
function buildShareText(reportNumber: string): string {
  return `Laporan shift ${reportNumber}. Buka di aplikasi MyCheck:`;
}

export function ShareReportButton({
  reportId,
  reportNumber,
  variant = 'outline',
  size = 'default',
  className,
  expiresHours = 720,
}: ShareReportButtonProps) {
  const { isAdmin } = useAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    setState('busy');
    setError(null);

    try {
      const origin = window.location.origin;

      let url: string;
      let text: string;

      if (isAdmin) {
        // Buat (atau reuse) token publik dulu.
        const res = await apiFetch<{ token: string }>(
          `/api/admin/reports/${encodeURIComponent(reportId)}/share`,
          { method: 'POST', json: { expiresHours } }
        );
        if (!res?.token) throw new Error('Server tidak mengembalikan token share');
        url = `${origin}/r/${encodeURIComponent(res.token)}`;
        text = `Laporan shift ${reportNumber} sudah selesai. Lihat di:`;
      } else {
        // Petugas: link aplikasi, butuh login.
        url = `${origin}/report/${encodeURIComponent(reportId)}`;
        text = buildShareText(reportNumber);
      }

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

  const label = state === 'copied' ? 'Tersalin' : isAdmin ? 'Bagikan' : 'Salin tautan';

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleShare}
        disabled={state === 'busy'}
        title={
          isAdmin
            ? 'Buat link publik laporan lalu bagikan (WhatsApp, dll.)'
            : 'Salin tautan laporan di aplikasi (dibuka oleh rekan yang punya akun)'
        }
        aria-label={label}
      >
        {state === 'busy' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
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
