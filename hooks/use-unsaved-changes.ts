'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook untuk mendeteksi form yang belum disimpan.
 * - Memicu warning browser saat user mencoba meninggalkan halaman
 * - Dipakai di form panjang (checklist builder, handover builder, pengaturan)
 */
export function useUnsavedChanges(isDirty: boolean) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      // Chrome membutuhkan returnValue di-set
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
