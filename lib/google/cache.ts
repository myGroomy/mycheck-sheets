// lib/google/cache.ts
// Cache in-memory per proses dengan TTL.
//
// Alasannya: Registry (Daftar_Cabang + Users) dibaca hampir di setiap request,
// sementara setiap baca = 1 panggilan Google Sheets API. Nilai Registry jarang
// berubah, jadi aman disimpan sebentar.
//
// Catatan: cache ini per-instance serverless, jadi tidak konsisten lintas
// region — itu trade-off yang diterima. Setiap mutasi lokal invalidate cache.

/** Default 60 detik: memangkas panggilan API tanpa staleness yang terasa. */
const DEFAULT_TTL_MS = 60_000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCache<T> {
  get(): T | null;
  set(value: T): void;
  clear(): void;
}

/** Cache satu nilai dengan TTL. `peek()` untuk memaksa refresh. */
export function ttlCache<T>(ttlMs: number = DEFAULT_TTL_MS): TtlCache<T> {
  let entry: Entry<T> | null = null;

  return {
    get() {
      if (!entry) return null;
      if (Date.now() >= entry.expiresAt) {
        entry = null;
        return null;
      }
      return entry.value;
    },
    set(value: T) {
      entry = { value, expiresAt: Date.now() + ttlMs };
    },
    clear() {
      entry = null;
    },
  };
}

/**
 * Cache hasil fungsi async: Eliminasi request paralel yang sama (single-flight)
 * sekaligus meng-cache hasilnya sampai TTL habis.
 */
export function memoize<T>(fn: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS) {
  let entry: Entry<Promise<T>> | null = null;

  return async (): Promise<T> => {
    if (entry && Date.now() < entry.expiresAt) return entry.value;

    // Single-flight: request yang datang bersamaan menunggu promise yang sama
    // daripada menembak API berulang kali.
    const pending = fn();
    entry = { value: pending, expiresAt: Date.now() + ttlMs };
    try {
      return await pending;
    } catch (error) {
      // Jangan menyimpan promise yang gagal — biarkan request berikutnya mencoba lagi.
      if (entry && entry.value === pending) entry = null;
      throw error;
    }
  };
}