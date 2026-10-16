'use client';

// components/ui/pin-input.tsx
// Input PIN enam digit sebagai enam kotak terpisah, dengan digit disamarkan.
//
// KENAPA SATU INPUT TERSEMBUNYI + ENAM KOTAK VISUAL
// Enam <input> terpisah tidak bisa dipakai untuk PIN yang disamarkan: nilai
// tiap kotak harus berisi '•', sehingga event change tidak bisa membaca digit
// yang baru diketik. Sebagai gantinya SATU input tersembunyi menampung nilai
// asli dan menangkap seluruh ketikan, lalu enam kotak hanya memvisualisasikan
// isinya. Hasilnya:
//   • masking gratis (kotak menampilkan titik, bukan angka),
//   • paste enam digit berjalan,
//   • auto-submit saat lengkap mudah,
//   • tidak bergantung pada -webkit-text-security (berfungsi di Firefox).
//
// Pola ini sengaja dipilih bukan enam input asli supaya perilaku konsisten
// lintas browser — penting karena MyCheck dipakai sebagai PWA.

import React, { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  /** Jumlah kotak. Default 6 (panjang PIN MyCheck). */
  length?: number;
  /** Nilai PIN, hanya angka. */
  value: string;
  /** Dipanggil setiap nilai berubah. */
  onChange: (value: string) => void;
  /**
   * Dipanggil saat `value` sudah `length` digit. Dipakai untuk auto-submit.
   * Hati-hati di form multi-field: panggilan per-field akan terpicu lebih awal
   * dari yang diingikan, jadi di situ lebih baik tombol submit yang dipakai.
   */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** id untuk asosiasi <label htmlFor>. */
  id?: string;
  className?: string;
}

export function PinInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  id,
  className,
}: PinInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const emit = useCallback(
    (next: string) => {
      onChange(next);
      if (next.length === length) onComplete?.(next);
    },
    [length, onChange, onComplete]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    emit(e.target.value.replace(/\D/g, '').slice(0, length));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (text) emit(text);
  };

  /**
   * Fokuskan input tersembunyi dan letakkan caret pada posisi yang diklik.
   * Tanpa ini, klik pada kotak ke-4 selalu menulis ke posisi terakhir, bukan
   * ke kotak yang diklik.
   */
  const focusAt = useCallback(
    (index: number) => {
      const el = inputRef.current;
      if (!el) return;
      const pos = Math.min(index, value.length);
      el.focus();
      el.setSelectionRange(pos, pos);
    },
    [value.length]
  );

  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={length}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={handleChange}
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="PIN"
        tabIndex={-1}
        className="absolute left-0 top-0 h-px w-px opacity-0"
        style={{ pointerEvents: 'none' }}
      />

      {Array.from({ length }, (_, i) => {
        const filled = i < value.length;
        // Kotak tempat caret berada: kotak tepat setelah digit terakhir.
        const isCaret = focused && i === value.length && value.length < length;
        return (
          <div
            key={i}
            role="presentation"
            onClick={() => focusAt(i)}
            className={cn(
              'flex h-14 flex-1 cursor-text items-center justify-center rounded-lg border bg-canvas transition-colors',
              focused ? 'border-ink' : 'border-border',
              isCaret && 'ring-1 ring-ink',
              disabled && 'opacity-50'
            )}
          >
            {filled && (
              <span
                className={cn(
                  'h-3 w-3 rounded-full bg-ink transition-transform',
                  isCaret && 'scale-110'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}