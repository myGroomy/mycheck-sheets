// lib/env.ts
// Validasi environment variables saat startup.
// Import module ini di server-side code untuk memastikan semua env var wajib ada.

import { z } from 'zod';

const envSchema = z.object({
  STOKIS_API_KEY: z.string().min(32, 'STOKIS_API_KEY terlalu pendek (minimal 32 karakter)'),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Environment variable tidak valid:\n${missing}`);
  }
  return parsed.data;
}

// Lazy validation hanya jalan saat module di-import pertama kali di server
let _env: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}
