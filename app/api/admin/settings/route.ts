import { NextResponse } from 'next/server';
import { requireRole, withAuth } from '../../../../lib/api-auth';
import {
  SETTINGS_CATALOG,
  coerceSettingValue,
  getSettingDefinition,
  validateSettingValue,
} from '../../../../lib/admin/settings-catalog';
import {
  ensureCatalogRows,
  listGlobalSettings,
  writeGlobalSettings,
} from '../../../../lib/google/settings-admin';

export const GET = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  // Pastikan semua key katalog punya baris, lalu baca.
  await ensureCatalogRows(
    SETTINGS_CATALOG.map((s) => ({ key: s.key, value: s.value }))
  );
  const stored = await listGlobalSettings();

  const settings = SETTINGS_CATALOG.map((def) => {
    const row = stored.find((s) => s.key === def.key);
    const raw = row?.value ?? def.value;
    return {
      key: def.key,
      value: coerceSettingValue(def.valueType, raw),
      valueType: def.valueType,
      description: def.description,
      updatedBy: null,
      updatedAt: null,
    };
  });

  return NextResponse.json({ settings });
});

export const PUT = // eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
withAuth(async (_req, ctx, _session) => {
  const roleErr = requireRole(ctx, 'admin');
  if (roleErr) return roleErr;

  let body: unknown;
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON' }, { status: 400 });
  }

  const incoming = (body as { settings?: { key?: string; value?: unknown }[] })?.settings;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json(
      { error: 'Body harus berisi { settings: [{ key, value }, ...] }' },
      { status: 400 }
    );
  }

  // Validasi semua nilai dulu sebelum menulis apa pun
  const updates: { rowNumber: number; value: string }[] = [];
  for (const item of incoming) {
    const key = String(item.key ?? '');
    const def = getSettingDefinition(key);
    if (!def) {
      return NextResponse.json(
        { error: `Pengaturan '${key}' tidak dikenal.` },
        { status: 400 }
      );
    }
    const raw =
      typeof item.value === 'boolean'
        ? item.value
          ? 'TRUE'
          : 'FALSE'
        : String(item.value ?? '');

    const invalid = validateSettingValue(def, raw);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
    updates.push({ rowNumber: -1, value: raw });
  }

  await ensureCatalogRows(
    SETTINGS_CATALOG.map((s) => ({ key: s.key, value: s.value }))
  );
  const stored = await listGlobalSettings();

  const batched = updates.map((u, i) => {
    const key = String(incoming[i].key ?? '');
    const row = stored.find((s) => s.key === key);
    return { rowNumber: row?.rowNumber ?? -1, value: u.value };
  });

  const missing = batched.filter((b) => b.rowNumber === -1);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Pengaturan tidak ditemukan di Settings_Global.' },
      { status: 500 }
    );
  }

  await writeGlobalSettings(batched);

  return NextResponse.json({ message: 'Pengaturan berhasil diperbarui' });
});