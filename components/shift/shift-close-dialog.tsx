'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';
import { ConfirmCloseDialog } from '@/components/admin/confirm-close-dialog';
import { uploadPhotoWithProgress } from '@/lib/upload-photo';

interface HandoverField {
  id: string;
  label: string;
  field_type: string;
  input_types?: string[];
  options: string[] | null;
  is_required: boolean;
}

const HANDOVER_LABEL: Record<string, string> = {
  teks: 'Jawaban singkat',
  angka: 'Angka',
  pilihan: 'Pilihan',
  ya_tidak: 'Ya / Tidak',
  pilihan_ganda: 'Pilihan ganda',
  kotak_centang: 'Pilihan jamak',
  dropdown: 'Dropdown',
  paragraf: 'Paragraf',
  tanggal_waktu: 'Tanggal dan waktu',
  foto: 'Foto',
};

export function ShiftCloseDialog({
  shiftId,
  shiftName,
  shiftDate,
  isPj,
  missingRequiredItems,
  fields,
  onClosed,
}: {
  shiftId: string;
  shiftName: string;
  shiftDate: string;
  isPj: boolean;
  missingRequiredItems: string[];
  fields: HandoverField[];
  onClosed: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [handoverId, setHandoverId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [noIncident, setNoIncident] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [reportNumber, setReportNumber] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [summaryStats, setSummaryStats] = useState<{
    total_required: number;
    done: number;
    skipped: number;
  } | null>(null);

  const hasUnsavedData = Object.keys(values).length > 0 || freeText.trim() !== '';

  const missingFields = fields.filter((field) => {
    if (!field.is_required) return false;
    const types = field.input_types?.length ? field.input_types : [field.field_type];
    const current = values[field.id];
    const parts = types.length > 1 && current && typeof current === 'object' && !Array.isArray(current)
      ? current as Record<string, unknown>
      : types.length === 1 ? { [types[0]]: current } : {};
    return types.some((type) => {
      const value = parts[type];
      return value === undefined || value === null ||
        (typeof value === 'string' && !value.trim()) ||
        (Array.isArray(value) && value.length === 0) ||
        (type === 'centang' && value !== true);
    });
  });

  const reset = () => {
    setStep(1);
    setValues({});
    setHandoverId(null);
    setPhotoError(null);
    setFreeText('');
    setNoIncident(false);
    setPin('');
    setError(null);
    setReportNumber(null);
    setReportId(null);
    setSummaryStats(null);
  };

  const updateFieldValue = (field: HandoverField, type: string, value: unknown) => {
    setValues((current) => {
      const types = field.input_types?.length ? field.input_types : [field.field_type];
      if (types.length === 1) return { ...current, [field.id]: value };
      const existing = current[field.id] && typeof current[field.id] === 'object'
        ? current[field.id] as Record<string, unknown>
        : {};
      return { ...current, [field.id]: { ...existing, [type]: value } };
    });
    // Auto-clear error saat user memperbaiki isian
    setError(null);
    setPhotoError(null);
  };

  const getFieldValue = (field: HandoverField, type: string): unknown => {
    const types = field.input_types?.length ? field.input_types : [field.field_type];
    const current = values[field.id];
    if (types.length === 1) return current;
    return current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)[type]
      : undefined;
  };

  const uploadHandoverPhotos = async (field: HandoverField, files: FileList | null) => {
    if (!files?.length) return;
    const totalPhotos = fields.reduce((count, currentField) => {
      const value = getFieldValue(currentField, 'foto');
      return count + (Array.isArray(value) ? value.length : 0);
    }, 0);
    if (totalPhotos + files.length > 5) {
      setPhotoError('Maksimal 5 foto untuk satu handover.');
      return;
    }
    setPhotoError(null);
    setUploadingField(field.id);
    try {
      let id = handoverId;
      if (!id) {
        const prepared = await fetch(`/api/shifts/${shiftId}/handover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          body: JSON.stringify({ prepare: true }),
        });
        const result = (await prepared.json()) as { error?: string; handover_id?: string };
        if (!prepared.ok || !result.handover_id) throw new Error(result.error || 'Handover gagal disiapkan.');
        id = result.handover_id;
        setHandoverId(id);
      }
      for (const file of Array.from(files)) {
        const { photoId } = await uploadPhotoWithProgress({
          file,
          ownerType: 'handover',
          ownerId: id,
          shiftInstanceId: shiftId,
        });
        setValues((current) => {
          const types = field.input_types?.length ? field.input_types : [field.field_type];
          if (types.length === 1) {
            const currentIds = Array.isArray(current[field.id]) ? current[field.id] as string[] : [];
            return { ...current, [field.id]: [...currentIds, photoId] };
          }
          const currentValue = current[field.id] && typeof current[field.id] === 'object'
            ? current[field.id] as Record<string, unknown>
            : {};
          const currentIds = Array.isArray(currentValue['foto']) ? currentValue['foto'] as string[] : [];
          return { ...current, [field.id]: { ...currentValue, foto: [...currentIds, photoId] } };
        });
      }
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : 'Foto handover gagal diunggah.');
    } finally {
      setUploadingField(null);
    }
  };

  const serializeValues = () => Object.fromEntries(fields.flatMap((field) => {
    const types = field.input_types?.length ? field.input_types : [field.field_type];
    const parts = Object.fromEntries(types.flatMap((type) => {
      const value = getFieldValue(field, type);
      if (value === undefined) return [];
      if (type === 'tanggal_waktu' && typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? [[type, value]] : [[type, date.toISOString()]];
      }
      return [[type, value]];
    }));
    if (Object.keys(parts).length === 0) return [];
    return [[field.id, types.length === 1 ? parts[types[0]] : parts]];
  }));

  const closeShift = async () => {
    if (pin.length !== 6) {
      setError('PIN harus terdiri dari 6 angka.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({
          pin,
          values: serializeValues(),
          free_text: freeText.trim() || undefined,
          no_incident: noIncident,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        report_number?: string;
        report_id?: string | null;
        summary_stats?: { total_required: number; done: number; skipped: number } | null;
      };
      if (!response.ok) throw new Error(result.error || 'Shift gagal ditutup.');
      setReportNumber(result.report_number ?? 'Laporan dibuat');
      setReportId(result.report_id ?? null);
      setSummaryStats(result.summary_stats ?? null);
      await onClosed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Shift gagal ditutup.');
    } finally {
      setBusy(false);
    }
  };

  if (!isPj) return null;

  return (
    <>
      <Button type="button" onClick={() => { reset(); setOpen(true); }}>
        Tutup Shift
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && hasUnsavedData && !busy && !reportNumber) {
            setConfirmClose(true);
            return;
          }
          setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          {reportNumber ? (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
              <DialogHeader className="mt-4">
                <DialogTitle>Shift berhasil ditutup</DialogTitle>
                <DialogDescription>Laporan {reportNumber} sudah dibuat dan dikunci.</DialogDescription>
              </DialogHeader>

              {summaryStats && (
                <div className="mt-4 rounded-lg border border-border bg-canvas p-4 text-left">
                  <h4 className="text-sm font-semibold">Ringkasan laporan</h4>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Item selesai</dt>
                      <dd className="font-medium">{summaryStats.done}/{summaryStats.total_required}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Item di-skip</dt>
                      <dd className="font-medium">{summaryStats.skipped}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Status</dt>
                      <dd className="font-medium text-emerald-700">Terkunci</dd>
                    </div>
                  </dl>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-2">
                {reportId && (
                  <Button asChild>
                    <Link href={`/report/${encodeURIComponent(reportId)}`}>
                      Lihat laporan
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link href="/">Kembali ke beranda</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Tutup Shift · Langkah {step} dari 3</DialogTitle>
                <DialogDescription>
                  {shiftName} · {shiftDate}. Checklist akan dikunci dan laporan shift dibuat setelah konfirmasi PIN.
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              {step === 1 && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Validasi checklist</h3>
                  {missingRequiredItems.length ? (
                    <>
                      <p className="text-sm text-ink-muted">
                        {missingRequiredItems.length} item wajib harus diselesaikan atau di-skip dengan alasan sebelum shift ditutup.
                      </p>
                      <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                        {missingRequiredItems.map((title) => (
                          <li key={title} className="text-sm">• {title}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Semua item wajib sudah selesai atau di-skip.
                    </p>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="max-h-[55dvh] space-y-4 overflow-y-auto pr-1">
                  <div>
                    <h3 className="font-semibold">Handover</h3>
                    <p className="mt-1 text-sm text-ink-muted">Isi informasi untuk shift berikutnya.</p>
                  </div>
                  {fields.map((field) => {
                    const types = field.input_types?.length ? field.input_types : [field.field_type];
                    return (
                      <fieldset key={field.id} className="space-y-3 rounded-lg border border-border p-3">
                        <legend className="px-1 text-sm font-medium">
                          {field.label}{field.is_required && <span className="text-error"> *</span>}
                        </legend>
                        {types.map((type) => (
                          <div key={type} className="space-y-1 text-sm">
                            <p className="text-xs text-ink-muted">{HANDOVER_LABEL[type] ?? type}</p>
                            {type === 'foto' ? (
                              <>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  capture="environment"
                                  multiple
                                  onChange={(event) => void uploadHandoverPhotos(field, event.target.files)}
                                  disabled={busy || uploadingField === field.id}
                                  className="block min-h-11 w-full text-sm"
                                />
                                <span className="text-xs text-ink-muted">
                                  {Array.isArray(getFieldValue(field, type)) ? (getFieldValue(field, type) as string[]).length : 0}/5 foto diunggah.
                                </span>
                              </>
                            ) : ['pilihan', 'pilihan_ganda', 'dropdown'].includes(type) ? (
                              <select
                                value={String(getFieldValue(field, type) ?? '')}
                                onChange={(event) => updateFieldValue(field, type, event.target.value)}
                                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
                              >
                                <option value="">Pilih</option>
                                {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            ) : type === 'kotak_centang' ? (
                              <div className="space-y-1">
                                {(field.options ?? []).map((option) => {
                                  const selected = Array.isArray(getFieldValue(field, type))
                                    ? getFieldValue(field, type) as string[]
                                    : [];
                                  return (
                                    <label key={option} className="flex min-h-10 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={selected.includes(option)}
                                        onChange={() => updateFieldValue(field, type, selected.includes(option)
                                          ? selected.filter((item) => item !== option)
                                          : [...selected, option])}
                                      />
                                      {option}
                                    </label>
                                  );
                                })}
                                {missingFields.length > 0 && (
                                  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                    <p className="font-semibold">
                                      Lengkapi {missingFields.length} field wajib sebelum melanjutkan:
                                    </p>
                                    <ul className="mt-1 list-inside list-disc">
                                      {missingFields.map((field) => <li key={field.id}>{field.label}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ) : type === 'ya_tidak' ? (
                              <select
                                value={String(getFieldValue(field, type) ?? '')}
                                onChange={(event) => updateFieldValue(field, type, event.target.value)}
                                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
                              >
                                <option value="">Pilih</option><option value="Ya">Ya</option><option value="Tidak">Tidak</option>
                              </select>
                            ) : type === 'paragraf' ? (
                              <textarea
                                value={String(getFieldValue(field, type) ?? '')}
                                onChange={(event) => updateFieldValue(field, type, event.target.value)}
                                rows={3}
                                maxLength={2000}
                                className="w-full rounded-lg border border-border bg-surface p-3 text-base"
                              />
                            ) : (
                              <input
                                type={type === 'angka' ? 'number' : type === 'tanggal_waktu' ? 'datetime-local' : 'text'}
                                value={String(getFieldValue(field, type) ?? '')}
                                onChange={(event) => updateFieldValue(field, type, event.target.value)}
                                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
                              />
                            )}
                          </div>
                        ))}
                      </fieldset>
                    );
                  })}
                  {photoError && <p role="alert" className="text-sm text-error">{photoError}</p>}
                  <label className="block space-y-1 text-sm font-medium">
                    Catatan tambahan
                    <textarea
                      value={freeText}
                      onChange={(event) => {
                        setFreeText(event.target.value);
                        setError(null);
                      }}
                      rows={3}
                      maxLength={2000}
                      className="w-full rounded-lg border border-border bg-surface p-3 text-base"
                      placeholder="Catatan untuk shift berikutnya (opsional)"
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={noIncident}
                      onChange={(event) => {
                        setNoIncident(event.target.checked);
                        setError(null);
                      }}
                      className="h-5 w-5"
                    />
                    Tidak ada incident yang perlu diteruskan
                  </label>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-4">
                  <h3 className="font-semibold">Konfirmasi penutupan</h3>
                  <div className="rounded-lg border border-border bg-canvas p-3 text-sm">
                    <p>{fields.length} field handover ditinjau</p>
                    <p>{noIncident ? 'Tidak ada incident yang perlu diteruskan.' : 'Catatan incident tetap tersedia pada laporan.'}</p>
                    <p className="mt-2 font-semibold">Setelah ditutup, checklist tidak dapat diubah.</p>
                  </div>
                  <label className="block space-y-1 text-sm font-medium">
                    <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /> PIN Anda</span>
                    <PasswordInput
                      inputMode="numeric"
                      autoComplete="current-password"
                      maxLength={6}
                      value={pin}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        setPin(event.target.value.replace(/\D/g, ''));
                        setError(null);
                      }}
                      className="min-h-12 text-lg tracking-[0.4em]"
                    />
                  </label>
                </section>
              )}

              <DialogFooter className="gap-2">
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={() => { setError(null); setStep((current) => current - 1); }} disabled={busy}>
                    Kembali
                  </Button>
                )}
                {step < 3 ? (
                  <Button
                    type="button"
                    onClick={() => { setError(null); setStep((current) => current + 1); }}
                    disabled={step === 1 ? missingRequiredItems.length > 0 : missingFields.length > 0 || Boolean(uploadingField)}
                  >
                    Lanjut
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void closeShift()} disabled={busy || pin.length !== 6}>
                    {(busy || Boolean(uploadingField)) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {busy ? 'Menutup shift...' : 'Konfirmasi & tutup'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmCloseDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        message="Isian handover yang belum disimpan akan hilang. Tutup dialog?"
        onConfirm={() => {
          reset();
          setConfirmClose(false);
          setOpen(false);
        }}
      />
    </>
  );
}
