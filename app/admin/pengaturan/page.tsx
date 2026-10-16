'use client';

import { useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingHint } from '@/components/ui/skeleton-transition';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/admin/api';
import { usePwaInstall } from '@/lib/pwa-install';
import { Download, CheckCircle2, Smartphone } from 'lucide-react';

interface Setting {
  key: string;
  value: string | number | boolean;
  valueType: 'int' | 'bool' | 'string' | 'text';
}

interface FieldDef {
  key: string;
  label: string;
  hint?: string;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Umum',
    fields: [
      {
        key: 'app_notice',
        label: 'Pengumuman',
        hint: 'Tampil di halaman login. Kosongkan untuk menyembunyikan.',
      },
      {
        key: 'maintenance_mode',
        label: 'Mode maintenance',
        hint: 'Aktifkan untuk menonaktifkan akses seluruh user (kecuali admin).',
      },
    ],
  },
  {
    title: 'Waktu & Toleransi',
    fields: [
      { key: 'tolerance_default_minutes', label: 'Toleransi baku item (menit)' },
    ],
  },
  {
    title: 'PIN & Sesi',
    fields: [
      { key: 'pin_max_attempts', label: 'Maks percobaan PIN salah' },
      { key: 'pin_lock_minutes', label: 'Durasi kunci akun (menit)' },
      { key: 'pin_block_weak', label: 'Blokir PIN lemah' },
      { key: 'session_days', label: 'Masa berlaku sesi (hari)' },
      { key: 'share_token_days', label: 'Masa berlaku tautan publik (hari)' },
    ],
  },
  {
    title: 'Foto',
    fields: [
      { key: 'photo_max_count', label: 'Maks foto per incident' },
      { key: 'photo_max_size_kb', label: 'Ukuran foto maks (KB)' },
      {
        key: 'photo_retention_days',
        label: 'Retensi foto (hari)',
        hint: '0 = mengikuti arsip mingguan',
      },
      { key: 'public_show_photos', label: 'Tampilkan foto di laporan publik' },
    ],
  },
  {
    title: 'Template WhatsApp',
    fields: [
      {
        key: 'whatsapp_template',
        label: 'Template pesan berbagi laporan',
        hint: 'Variabel: {cabang} {tanggal} {shift} {pj} {ringkasan} {tautan}',
      },
    ],
  },
];

const PREVIEW_SAMPLE: Record<string, string> = {
  '{cabang}': 'Bandung Pusat',
  '{tanggal}': '05 Okt 2026',
  '{shift}': 'Opening',
  '{pj}': 'Rina',
  '{ringkasan}': '20/20 item, 0 incident',
  '{tautan}': 'https://app.example.id/r/abc123',
};

function previewTemplate(tpl: string): string {
  return Object.entries(PREVIEW_SAMPLE).reduce(
    (acc, [k, v]) => acc.split(k).join(v),
    tpl
  );
}

export default function PengaturanPage() {
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const { canInstall, isStandalone, isSupported, install } = usePwaInstall();
  const originalSettings = useRef<Record<string, Setting>>({});

  const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings.current);
  useUnsavedChanges(isDirty);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ settings: Setting[] }>('/api/admin/settings');
      const map: Record<string, Setting> = {};
      data.settings.forEach((s) => {
        map[s.key] = s;
      });
      setSettings(map);
      originalSettings.current = map;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat pengaturan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = (key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as Setting), value },
    }));
  };

  const handleSave = async () => {
    // Validasi sederhana di klien
    for (const g of GROUPS) {
      for (const f of g.fields) {
        const s = settings[f.key];
        if (!s) continue;
        if (s.valueType === 'int' && !/^\d+$/.test(String(s.value))) {
          toast.error(`${f.label} harus berupa angka`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = Object.values(settings).map((s) => ({
        key: s.key,
        value: typeof s.value === 'boolean' ? (s.value ? 'TRUE' : 'FALSE') : String(s.value),
      }));
      await apiFetch('/api/admin/settings', { method: 'PUT', json: { settings: payload } });
      toast.success('Pengaturan disimpan');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Pengaturan</h1>
          <p className="text-xs text-ink-muted">
            Berlaku untuk seluruh cabang kecuali disebut lain
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </Button>
      </div>

      {loading && <LoadingHint className="justify-start p-0">Memuat pengaturan…</LoadingHint>}

      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <CardHeader>
              <CardTitle className="text-sm">{g.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {g.fields.map((f) => {
                const s = settings[f.key];
                if (!s) return null;
                return (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`set-${f.key}`}>{f.label}</Label>
                    {s.valueType === 'bool' ? (
                      <Select
                        value={s.value === true ? 'TRUE' : s.value === false ? 'FALSE' : String(s.value ?? '')}
                        onValueChange={(v) => setValue(f.key, v)}
                      >
                        <SelectTrigger id={`set-${f.key}`} aria-label={f.label}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRUE">Aktif (TRUE)</SelectItem>
                          <SelectItem value="FALSE">Nonaktif (FALSE)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : s.valueType === 'text' || s.key === 'whatsapp_template' ? (
                      <Textarea
                        id={`set-${f.key}`}
                        value={String(s.value ?? '')}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        rows={3}
                      />
                    ) : (
                      <Input
                        id={`set-${f.key}`}
                        value={String(s.value ?? '')}
                        inputMode="numeric"
                        onChange={(e) => setValue(f.key, e.target.value.replace(/[^\d-]/g, ''))}
                      />
                    )}
                    {f.hint && <p className="text-xs text-ink-light">{f.hint}</p>}
                    {f.key === 'whatsapp_template' && (
                      <div className="rounded-lg border border-border bg-canvas p-3 text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-wide text-ink-muted">
                          Pratinjau
                        </span>
                        {previewTemplate(String(s.value ?? ''))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        {/* PWA Install — selalu tampil di settings walau banner sudah di-dismiss */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Install Aplikasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {isStandalone ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-700">Aplikasi sudah terpasang</span>
                </>
              ) : canInstall ? (
                <>
                  <Smartphone className="h-4 w-4 text-ink-muted" />
                  <span>Siap dipasang sebagai aplikasi</span>
                </>
              ) : (
                <>
                  <Smartphone className="h-4 w-4 text-ink-muted" />
                  <span className="text-ink-muted">
                    {isSupported
                      ? 'Browser belum menawarkan install. Coba buka di Chrome/Edge Android atau Safari iOS.'
                      : 'Browser tidak mendukung PWA install.'}
                  </span>
                </>
              )}
            </div>
            {canInstall && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={installing}
                onClick={async () => {
                  setInstalling(true);
                  try {
                    await install();
                    toast.success('Aplikasi berhasil dipasang.');
                  } catch {
                    toast.error('Gagal memasang aplikasi.');
                  } finally {
                    setInstalling(false);
                  }
                }}
              >
                <Download className="h-4 w-4" />
                {installing ? 'Memasang...' : 'Pasang sekarang'}
              </Button>
            )}
            <p className="text-xs text-ink-light">
              Banner install bisa disembunyikan, tapi tombol ini selalu tersedia di settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

