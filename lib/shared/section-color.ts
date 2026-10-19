// lib/shared/section-color.ts
// Fase 16 — warna section: validasi hex, kontras teks, dan fallback
// deterministik (grayscale) bila warna tak valid/tak diatur.
// Modul ringan (tanpa import berat) supaya bisa dipakai di snapshot
// (server) maupun komponen (client).

const HEX_RE = /^#[0-9a-f]{6}$/i;
const FALLBACKS = ['#9ca3af', '#a8a29e', '#b5b8bd', '#a3a8ad'];

/** Parse hex 6 digit ke rgb; null bila tidak valid. */
export function parseHexColor(value: unknown): { r: number; g: number; b: number } | null {
  const s = String(value ?? '').trim();
  if (!HEX_RE.test(s)) return null;
  return {
    r: parseInt(s.slice(1, 3), 16),
    g: parseInt(s.slice(3, 5), 16),
    b: parseInt(s.slice(5, 7), 16),
  };
}

/** Warna hex valid untuk disimpan; null bila input kosong/tidak valid. */
export function normalizeSectionColor(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  return HEX_RE.test(s) ? s.toLowerCase() : null;
}

/**
 * Warna teks yang terbaca di atas latar warna section:
 * gelap untuk latar terang, terang untuk latar gelap (kontras WCAG-ish).
 */
export function sectionTextColor(hex: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#1f2937';
  // Relative luminance (simplified sRGB).
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return lum > 0.6 ? '#1f2937' : '#f9fafb';
}

/**
 * Fallback warna section bila snapshot tak punya warna: abu-abu
 * (grayscale) deterministik berdasar urutan section supaya tidak
 * melanggar kontras dan tetap konsisten antar render.
 */
export function sectionFallbackColor(index: number): string {
  return FALLBACKS[Math.abs(index) % FALLBACKS.length];
}

/** Warna terpakai: nilai snapshot bila valid, fallback bila tidak. */
export function resolvedSectionColor(value: string | null | undefined, index: number): string {
  return normalizeSectionColor(value) ?? sectionFallbackColor(index);
}
