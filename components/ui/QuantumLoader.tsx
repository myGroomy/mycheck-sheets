// components/ui/QuantumLoader.tsx
// Spinner branded dua cincin, di-port dari STOKIS (components/ui/QuantumLoader).
// Bedanya hanya pada sumber warna: STOKIS memakai token DaisyUI
// `var(--color-primary)`, MYCHECK memakai token `--color-primary` (#292524)
// yang sudah didefinisikan di `@theme` app/globals.css.
//
// Animasi tetap CSS keyframes (bukan framer-motion) supaya tidak menambah
// paket animasi ke subtree mana pun: 2.5s infinite, cincin kedua di-offset
// -1.25s sehingga terlihat berputar berlawanan arah (efek "quantum").

import { cn } from '@/lib/utils';

interface QuantumLoaderProps {
  text?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function QuantumLoader({ text, className, size = 'md' }: QuantumLoaderProps) {
  const sizeMap = { sm: 40, md: 52, lg: 65 };
  const px = sizeMap[size];

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative" style={{ width: px, height: px }}>
        <span className="absolute animate-quantum rounded-[50px] shadow-[inset_0_0_0_3px_var(--color-primary)]" />
        <span className="absolute animate-quantum [animation-delay:-1.25s] rounded-[50px] shadow-[inset_0_0_0_3px_var(--color-primary)]" />
      </div>
      {text ? <p className="text-xs font-medium text-ink-muted tracking-wide">{text}</p> : null}
    </div>
  );
}

/**
 * Loader dalam halaman — KANONIKAL untuk seluruh halaman MYCHECK.
 *
 * Gunakan komponen ini (bukan `<QuantumLoader>` langsung) supaya ukuran,
 * tinggi area, dan gaya teks seragam di semua halaman. Kalau sebuah halaman
 * butuh loader-nya sedikit beda, ubah di sini, bukan di tiap call-site.
 *
 * ```tsx
 * <PageLoader text="Memuat laporan…" />
 * ```
 */
export function PageLoader({
  text,
  /** Padding boxed seperti kartu, atau penuh tanpa border. */
  boxed = true,
  className,
}: {
  text?: string;
  boxed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-40 items-center justify-center',
        boxed && 'rounded-xl border border-border bg-surface',
        className
      )}
      role="status"
      aria-label={text || 'Memuat'}
    >
      <QuantumLoader size="sm" text={text} />
    </div>
  );
}

/** Varian layar penuh — untuk state loading satu halaman. */
export function QuantumLoaderFull({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <QuantumLoader text={text || 'Memuat'} size="lg" />
    </div>
  );
}

/**
 * Overlay layar penuh yang menutupi seluruh viewport — dipakai saat transisi
 * besar yang memuat ulang sesi (logout, login, ganti PIN). Berbeda dengan
 * `PageLoader` yang hanya mengisi area konten, overlay ini menutup navbar dan
 * seluruh halaman supaya tidak ada interaksi selama proses berjalan.
 *
 * `label` ditulis sebagai props (bukan hardcoded) supaya teks yang tampil
 * konsisten dengan aksi yang sedang berjalan.
 */
export function QuantumLoaderOverlay({
  label = 'Memuat',
}: {
  label?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-canvas/90 backdrop-blur-sm"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      <QuantumLoader text={label} size="lg" />
    </div>
  );
}

/**
 * Varian inline 20×20 yang mengikuti warna teks (`currentColor`) — untuk
 * tombol, baris tabel, atau apa pun yang tidak bisa klien spinner penuh.
 */
export function QuantumLoaderMini({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center justify-center relative', className)}
      style={{ width: 20, height: 20 }}
      role="status"
      aria-label="Memuat"
    >
      <span
        className="absolute rounded-[50px] animate-quantum-mini"
        style={{ boxShadow: 'inset 0 0 0 2px currentColor' }}
      />
      <span
        className="absolute rounded-[50px] animate-quantum-mini [animation-delay:-1.25s]"
        style={{ boxShadow: 'inset 0 0 0 2px currentColor' }}
      />
    </span>
  );
}
