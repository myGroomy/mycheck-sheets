'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, GripVertical, Pencil, Plus, Power, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HandoverFieldEditor,
  type HandoverFormValues,
} from '@/components/admin/handover-field-editor';
import { TemplateNotice } from '@/components/admin/template-notice';
import {
  createHandoverField,
  deactivateHandoverField,
  listBranches,
  listHandoverFields,
  listShifts,
  updateHandoverField,
  type AdminBranch,
  type HandoverField,
  type ShiftDefinition,
} from '@/lib/admin/api';

const FIELD_TYPE_LABEL: Record<string, string> = {
  teks: 'Teks',
  angka: 'Angka',
  pilihan: 'Pilihan',
  ya_tidak: 'Ya / Tidak',
};

export default function HandoverBuilderPage() {
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [fields, setFields] = useState<HandoverField[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HandoverField | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Inline editing state
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [savingInline, setSavingInline] = useState(false);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const data = await listBranches();
        const active = data.branches.filter((b) => b.isActive);
        setBranches(active);
        if (active.length > 0) setBranchId((prev) => prev || active[0].id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Gagal memuat cabang');
      }
    };
    loadBranches();
  }, []);

  useEffect(() => {
    if (!branchId) return;
    setShiftId('');
    listShifts(branchId)
      .then((data) => setShifts(data.shifts.filter((s) => s.isActive)))
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : 'Gagal memuat shift')
      );
  }, [branchId]);

  const loadFields = useCallback(async (id: string) => {
    if (!id) {
      setFields([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listHandoverFields(id);
      setFields(data.fields);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat bidang serah terima');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFields(shiftId);
  }, [shiftId, loadFields]);

  const submitField = async (values: HandoverFormValues) => {
    if (!shiftId) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateHandoverField(editing.id, values);
        toast.success('Bidang serah terima diperbarui');
      } else {
        await createHandoverField(shiftId, values);
        toast.success('Bidang serah terima ditambahkan');
      }
      setEditorOpen(false);
      await loadFields(shiftId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan bidang serah terima';
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (field: HandoverField) => {
    try {
      if (field.isActive) {
        await deactivateHandoverField(field.id);
        toast.success('Bidang dinonaktifkan (tidak dihapus)');
      } else {
        await updateHandoverField(field.id, { isActive: true });
        toast.success('Bidang diaktifkan');
      }
      await loadFields(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status');
    }
  };

  const swapOrder = async (from: number, to: number) => {
    const a = fields[from];
    const b = fields[to];
    if (!a || !b) return;
    const prev = fields;
    setFields((current) => {
      const next = [...current];
      next[from] = b;
      next[to] = a;
      return next;
    });
    try {
      await updateHandoverField(a.id, { sortOrder: b.sortOrder });
      await updateHandoverField(b.id, { sortOrder: a.sortOrder });
      toast.success('Urutan diperbarui');
    } catch (err) {
      setFields(prev);
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah urutan');
    }
  };

  const startEditLabel = (fieldId: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    setEditingLabel(fieldId);
    setLabelDraft(field.label);
  };

  const saveInlineLabel = async (fieldId: string) => {
    const trimmed = labelDraft.trim();
    if (trimmed.length < 2) {
      toast.error('Label minimal 2 karakter');
      return;
    }
    setSavingInline(true);
    try {
      await updateHandoverField(fieldId, { label: trimmed });
      setEditingLabel(null);
      toast.success('Label diperbarui');
      await loadFields(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan label');
    } finally {
      setSavingInline(false);
    }
  };

  const changeFieldType = async (fieldId: string, newType: HandoverField['fieldType']) => {
    try {
      await updateHandoverField(fieldId, { fieldType: newType });
      toast.success('Tipe isian diubah');
      await loadFields(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah tipe isian');
    }
  };

  const onDrop = (to: number) => {
    if (dragIndex === null || dragIndex === to) {
      setDragIndex(null);
      return;
    }
    void swapOrder(dragIndex, to);
    setDragIndex(null);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Handover Builder</h1>
        <p className="text-xs text-ink-muted">
          Daftar bidang serah terima per definisi shift. Seret baris untuk mengubah urutan.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="handover-branch" className="text-xs font-medium text-ink-muted">
            Cabang
          </label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger id="handover-branch">
              <SelectValue placeholder="Pilih cabang" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="handover-shift" className="text-xs font-medium text-ink-muted">
            Shift
          </label>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger id="handover-shift">
              <SelectValue placeholder="Pilih shift" />
            </SelectTrigger>
            <SelectContent>
              {shifts.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.startTime} - {s.endTime})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <TemplateNotice />

      <div className="flex justify-end">
        <Button
          disabled={!shiftId}
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Tambah bidang
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        {!shiftId && <p className="p-4 text-sm text-ink-muted">Pilih shift terlebih dahulu</p>}
        {shiftId && loading && <p className="p-4 text-sm text-ink-muted">Memuat...</p>}
        {shiftId && !loading && fields.length === 0 && (
          <p className="p-4 text-sm text-ink-muted">Belum ada bidang serah terima</p>
        )}
        {shiftId &&
          !loading &&
          fields.map((f, index) => (
            <div
              key={f.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-2 border-b border-border p-3 last:border-b-0 ${
                dragIndex === index ? 'bg-primary/5' : ''
              }`}
            >
              <GripVertical
                className="h-4 w-4 shrink-0 cursor-grab text-ink-muted"
                aria-hidden
              />
              <div className="min-w-[140px] flex-1">
                {editingLabel === f.id ? (
                  <div className="space-y-1">
                    <Input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveInlineLabel(f.id);
                        if (e.key === 'Escape') setEditingLabel(null);
                      }}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => void saveInlineLabel(f.id)} disabled={savingInline}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingLabel(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditLabel(f.id)}
                    className="group flex items-center gap-1 text-left"
                    title="Klik untuk mengubah label"
                  >
                    <span className="text-sm font-medium">
                      {index + 1}. {f.label}
                      {f.isRequired && <span className="text-danger"> *</span>}
                    </span>
                    <Pencil className="h-3 w-3 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
                <div className="mt-1">
                  <Select
                    value={f.fieldType}
                    onValueChange={(v) => void changeFieldType(f.id, v as HandoverField['fieldType'])}
                  >
                    <SelectTrigger className="h-6 text-xs">
                      <SelectValue>
                        {FIELD_TYPE_LABEL[f.fieldType] ?? f.fieldType}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {f.fieldType === 'pilihan' && f.options && (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {(Array.isArray(f.options) ? f.options : [f.options]).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={f.isActive ? 'default' : 'secondary'}>
                {f.isActive ? 'Aktif' : 'Nonaktif'}
              </Badge>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(f);
                    setFormError(null);
                    setEditorOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Ubah
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive(f)}>
                  <Power className="h-3.5 w-3.5" />
                  {f.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
              </div>
            </div>
          ))}
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-3">
          <p className="text-sm font-semibold">Pratinjau</p>
          <p className="text-xs text-ink-muted">Form serah terima seperti dilihat petugas</p>
        </div>
        {!shiftId ? (
          <p className="p-4 text-sm text-ink-muted">Pilih shift untuk melihat pratinjau</p>
        ) : (
          <div className="space-y-2 p-3">
            {fields.filter((f) => f.isActive).length === 0 ? (
              <p className="text-sm text-ink-muted">Belum ada bidang aktif</p>
            ) : (
              fields
                .filter((f) => f.isActive)
                .map((f) => (
                  <div key={f.id} className="space-y-1">
                    <label className="text-xs font-medium">
                      {f.label}
                      {f.isRequired && <span className="text-danger"> *</span>}
                    </label>
                    {f.fieldType === 'teks' && (
                      <div className="rounded border border-border bg-background p-2 text-xs text-ink-muted">
                        Input teks...
                      </div>
                    )}
                    {f.fieldType === 'angka' && (
                      <div className="rounded border border-border bg-background p-2 text-xs text-ink-muted">
                        Input angka...
                      </div>
                    )}
                    {f.fieldType === 'pilihan' && (
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(f.options) ? f.options : [f.options]).map((opt, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-border px-2 py-0.5 text-xs"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                    {f.fieldType === 'ya_tidak' && (
                      <div className="flex gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs">Ya</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs">Tidak</span>
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      <HandoverFieldEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        field={editing}
        saving={saving}
        error={formError}
        onSubmit={submitField}
      />
    </div>
  );
}
