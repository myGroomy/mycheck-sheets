'use client';

// lib/pwa-install.ts
// Shared PWA install state — singleton via globalThis.
//
// Hanya SATU listener untuk `beforeinstallprompt` yang bisa menangkap event
// di browser. Kalau dua komponen masing-masing addEventListener, yang kedua
// tidak akan dapat event-nya. Oleh karena itu state disimpan di globalThis
// dan dibagi ke semua komponen yang membutuhkannya.

import { useEffect, useState, useSyncExternalStore } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

interface PwaInstallState {
  /** null = browser tidak support / event belum terpicu */
  deferredPrompt: BeforeInstallPromptEvent | null;
  isStandalone: boolean;
  isSupported: boolean;
}

const DEFAULT_STATE: PwaInstallState = {
  deferredPrompt: null,
  isStandalone: false,
  isSupported: false,
};

const GLOBAL_KEY = '__mycheck_pwa_install__';

function getGlobal(): PwaInstallState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: PwaInstallState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { ...DEFAULT_STATE };
  }
  return g[GLOBAL_KEY]!;
}

function setGlobal(partial: Partial<PwaInstallState>) {
  const current = getGlobal();
  const next = { ...current, ...partial };
  (globalThis as typeof globalThis & { [GLOBAL_KEY]?: PwaInstallState })[GLOBAL_KEY] = next;
  notifyListeners();
}

const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PwaInstallState {
  return getGlobal();
}

/** True bila `beforeinstallprompt` pernah tericu dan prompt belum dipakai. */
export function usePwaInstall() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_STATE);

  useEffect(() => {
    const current = getGlobal();
    // Jangan override kalau sudah ada listener aktif dari komponen lain.
    if (current.isSupported) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setGlobal({ deferredPrompt: event as BeforeInstallPromptEvent });
    };

    const handleAppInstalled = () => {
      setGlobal({ deferredPrompt: null, isStandalone: true });
    };

    const updateStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setGlobal({ isStandalone });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Cek apakah sudah standalone saat mount
    updateStandalone();

    setGlobal({ isSupported: true });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /** Trigger install prompt. Return true bila prompt berhasil dipicu. */
  const install = async (): Promise<boolean> => {
    const { deferredPrompt } = getGlobal();
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setGlobal({ deferredPrompt: null });
    return true;
  };

  return {
    deferredPrompt: state.deferredPrompt,
    isStandalone: state.isStandalone,
    isSupported: state.isSupported,
    /** True bila ada deferredPrompt yang bisa dipakai untuk install. */
    canInstall: state.deferredPrompt !== null && !state.isStandalone,
    install,
  };
}
