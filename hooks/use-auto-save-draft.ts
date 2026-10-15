'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Auto-save draft ke localStorage supaya form panjang tidak kehilangan isian
 * ketika session berakhir atau tab tertutup tidak sengaja.
 *
 * Pemakaian:
 *   const { savedAt, clearDraft, lastSavedDraft } = useAutoSaveDraft({
 *     key: 'checklist-builder-draft',
 *     isDirty,
 *     getValue: () => ({ categoryName, titleDraft, instructionDraft }),
 *     delay: 800,
 *   });
 */
export function useAutoSaveDraft<T>({
  key,
  isDirty,
  getValue,
  delay = 800,
  enabled = true,
}: {
  /** Kunci unik di localStorage. Prefix dengan nama fitur. */
  key: string;
  /** True saat form punya perubahan yang belum disimpan ke server. */
  isDirty: boolean;
  /** Kembalikan nilai draft yang perlu disimpan. */
  getValue: () => T;
  /** Debounce dalam ms sebelum menulis. Default 800. */
  delay?: number;
  /** Set false untuk mematikan auto-save sementara. */
  enabled?: boolean;
}) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getValueRef = useRef(getValue);
  getValueRef.current = getValue;

  const write = useCallback(() => {
    try {
      const value = getValueRef.current();
      const payload = JSON.stringify({ value, savedAt: new Date().toISOString() });
      localStorage.setItem(key, payload);
      setSavedAt(new Date().toISOString());
    } catch {
      // localStorage penuh atau tidak tersedia (mode privat) — abaikan.
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // abaikan
    }
    setSavedAt(null);
  }, [key]);

  const readDraft = useCallback((): { value: T; savedAt: string } | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { value?: T; savedAt?: string };
      if (!parsed || typeof parsed !== 'object' || parsed.value === undefined) return null;
      return { value: parsed.value, savedAt: parsed.savedAt ?? '' };
    } catch {
      return null;
    }
  }, [key]);

  // Auto-save dengan debounce setiap kali form berubah.
  useEffect(() => {
    if (!enabled || !isDirty) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(write, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isDirty, enabled, delay, write]);

  // Bersihkan timer saat unmount.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { savedAt, write, clearDraft, readDraft };
}
