'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CategoryTree,
  type CategoryWithPoints,
} from '@/components/admin/category-tree';
import {
  PointEditorDialog,
  type PointFormValues,
} from '@/components/admin/point-editor-dialog';
import { ShiftPreviewDialog } from '@/components/admin/shift-preview-dialog';
import { TemplateNotice } from '@/components/admin/template-notice';
import {
  createCategory,
  createPoint,
  deactivateCategory,
  deactivatePoint,
  duplicateCategory as duplicateCategoryApi,
  duplicatePoint as duplicatePointApi,
  listBranches,
  listCategories,
  listPoints,
  listShifts,
  updateCategory,
  updatePoint,
  type AdminBranch,
  type ChecklistPoint,
  type ShiftDefinition,
  type SopCategory,
} from '@/lib/admin/api';

const INPUT_TYPE_LABEL: Record<string, string> = {
  centang: 'Centang',
  foto: 'Foto',
  teks: 'Teks',
  angka: 'Angka',
  ok_tidak_ok: 'OK / Tidak OK',
};

interface CategoryFormValues {
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default function ChecklistBuilderPage() {
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [categories, setCategories] = useState<CategoryWithPoints[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SopCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categorySort, setCategorySort] = useState(0);
  const [categoryActive, setCategoryActive] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [pointOpen, setPointOpen] = useState(false);
  const [pointCategoryId, setPointCategoryId] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<ChecklistPoint | null>(null);
  const [savingPoint, setSavingPoint] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [instructionDraft, setInstructionDraft] = useState('');
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

  const loadTree = useCallback(async (id: string) => {
    if (!id) {
      setCategories([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listCategories(id);
      const withPoints: CategoryWithPoints[] = await Promise.all(
        data.categories.map(async (cat) => {
          const points = await listPoints(cat.id);
          return { ...cat, points: points.points };
        })
      );
      setCategories(withPoints);
      setSelectedCategoryId((prev) =>
        prev && withPoints.some((c) => c.id === prev) ? prev : (withPoints[0]?.id ?? null)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat kategori SOP');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree(shiftId);
  }, [shiftId, loadTree]);

  const submitCategory = async (values: CategoryFormValues) => {
    if (!shiftId) return;
    setSavingCategory(true);
    setCategoryError(null);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, values);
        toast.success('Kategori SOP diperbarui');
      } else {
        await createCategory(shiftId, values);
        toast.success('Kategori SOP ditambahkan');
      }
      setCategoryOpen(false);
      await loadTree(shiftId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan kategori SOP';
      setCategoryError(message);
      toast.error(message);
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleCategory = async (cat: SopCategory) => {
    try {
      if (cat.isActive) {
        await deactivateCategory(cat.id);
        toast.success('Kategori dinonaktifkan (tidak dihapus)');
      } else {
        await updateCategory(cat.id, { isActive: true });
        toast.success('Kategori diaktifkan');
      }
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status kategori');
    }
  };

  const togglePoint = async (point: ChecklistPoint) => {
    try {
      if (point.isActive) {
        await deactivatePoint(point.id);
        toast.success('Item dinonaktifkan (tidak dihapus)');
      } else {
        await updatePoint(point.id, { isActive: true });
        toast.success('Item diaktifkan');
      }
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status item');
    }
  };

  const submitPoint = async (values: PointFormValues) => {
    if (!pointCategoryId) return;
    setSavingPoint(true);
    setPointError(null);
    try {
      if (editingPoint) {
        await updatePoint(editingPoint.id, values);
        toast.success('Item checklist diperbarui');
      } else {
        await createPoint(pointCategoryId, values);
        toast.success('Item checklist ditambahkan');
      }
      setPointOpen(false);
      await loadTree(shiftId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan item checklist';
      setPointError(message);
      toast.error(message);
    } finally {
      setSavingPoint(false);
    }
  };

  const duplicateCategory = async (cat: SopCategory) => {
    setBusyId(cat.id);
    try {
      await duplicateCategoryApi(cat.id);
      toast.success(`Kategori "${cat.name}" diduplikasi beserta itemnya`);
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menduplikasi kategori');
    } finally {
      setBusyId(null);
    }
  };

  const duplicatePoint = async (point: ChecklistPoint) => {
    setBusyId(point.id);
    try {
      await duplicatePointApi(point.id);
      toast.success(`Item "${point.title}" diduplikasi`);
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menduplikasi item');
    } finally {
      setBusyId(null);
    }
  };

  const swapCategoryOrder = async (from: number, to: number) => {
    const a = categories[from];
    const b = categories[to];
    if (!a || !b) return;
    const prev = categories;
    setCategories((cur) => {
      const next = [...cur];
      next[from] = b;
      next[to] = a;
      return next;
    });
    try {
      await updateCategory(a.id, { sortOrder: b.sortOrder ?? 0 });
      await updateCategory(b.id, { sortOrder: a.sortOrder ?? 0 });
      toast.success('Urutan kategori diperbarui');
    } catch (err) {
      setCategories(prev);
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah urutan kategori');
    }
  };

  const swapPointOrder = async (categoryId: string, from: number, to: number) => {
    const cat = categories.find((c) => c.id === categoryId);
    const a = cat?.points[from];
    const b = cat?.points[to];
    if (!cat || !a || !b) return;
    const prev = categories;
    setCategories((cur) =>
      cur.map((c) => {
        if (c.id !== categoryId) return c;
        const points = [...c.points];
        points[from] = b;
        points[to] = a;
        return { ...c, points };
      })
    );
    try {
      await updatePoint(a.id, { sortOrder: b.sortOrder });
      await updatePoint(b.id, { sortOrder: a.sortOrder });
      toast.success('Urutan item diperbarui');
    } catch (err) {
      setCategories(prev);
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah urutan item');
    }
  };

  // Inline editing helpers
  const startEditTitle = () => {
    if (!selectedPoint) return;
    setTitleDraft(selectedPoint.title);
    setEditingTitle(true);
  };

  const startEditInstruction = () => {
    if (!selectedPoint) return;
    setInstructionDraft(selectedPoint.instruction ?? '');
    setEditingInstruction(true);
  };

  const saveInlineTitle = async () => {
    if (!selectedPoint) return;
    const trimmed = titleDraft.trim();
    if (trimmed.length < 2) {
      toast.error('Judul minimal 2 karakter');
      return;
    }
    setSavingInline(true);
    try {
      await updatePoint(selectedPoint.id, { title: trimmed });
      setEditingTitle(false);
      toast.success('Judul diperbarui');
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan judul');
    } finally {
      setSavingInline(false);
    }
  };

  const saveInlineInstruction = async () => {
    if (!selectedPoint) return;
    const trimmed = instructionDraft.trim();
    setSavingInline(true);
    try {
      await updatePoint(selectedPoint.id, { instruction: trimmed === '' ? null : trimmed });
      setEditingInstruction(false);
      toast.success('Petunjuk diperbarui');
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan petunjuk');
    } finally {
      setSavingInline(false);
    }
  };

  const changeInputType = async (newType: string) => {
    if (!selectedPoint) return;
    setBusyId(selectedPoint.id);
    try {
      await updatePoint(selectedPoint.id, { inputType: newType as ChecklistPoint['inputType'] });
      toast.success('Tipe input diubah');
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah tipe input');
    } finally {
      setBusyId(null);
    }
  };

  const selectedPoint = categories
    .flatMap((c) => c.points)
    .find((p) => p.id === selectedPointId) ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Checklist Builder</h1>
          <p className="text-xs text-ink-muted">
            Susun kategori SOP dan item checklist per definisi shift. Seret baris untuk
            mengubah urutan.
          </p>
        </div>
        <Button variant="outline" disabled={!shiftId} onClick={() => setPreviewOpen(true)}>
          <ExternalLink className="h-4 w-4" />
          Pratinjau
        </Button>
      </div>

      <TemplateNotice />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px_280px]">
        <section className="space-y-2" aria-label="Pilih cabang dan shift">
          <h2 className="text-sm font-semibold">1. Cabang &amp; Shift</h2>
          <div className="space-y-1">
            <label htmlFor="cb-branch" className="text-xs font-medium text-ink-muted">
              Cabang
            </label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="cb-branch">
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
            <label htmlFor="cb-shift" className="text-xs font-medium text-ink-muted">
              Shift
            </label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger id="cb-shift">
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
          <p className="text-xs text-ink-muted">
            Definisi shift dibuat di halaman <span className="font-medium">Shift</span>.
          </p>
        </section>

        <section className="space-y-2" aria-label="Kategori dan item checklist">
          <h2 className="text-sm font-semibold sm:hidden">2. Kategori &amp; Item</h2>
          {!shiftId && (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
              Pilih shift untuk melihat kategori SOP
            </p>
          )}
          {shiftId && loading && <p className="text-sm text-ink-muted">Memuat...</p>}
          {shiftId && !loading && (
            <CategoryTree
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              onAddCategory={() => {
                setEditingCategory(null);
                setCategoryName('');
                setCategorySort(categories.length);
                setCategoryActive(true);
                setCategoryError(null);
                setCategoryOpen(true);
              }}
              onEditCategory={(cat) => {
                setEditingCategory(cat);
                setCategoryName(cat.name);
                setCategorySort(cat.sortOrder ?? 0);
                setCategoryActive(cat.isActive);
                setCategoryError(null);
                setCategoryOpen(true);
              }}
              onToggleCategory={toggleCategory}
              onAddPoint={(categoryId) => {
                setPointCategoryId(categoryId);
                setEditingPoint(null);
                setPointError(null);
                setPointOpen(true);
              }}
              onEditPoint={(point) => {
                setPointCategoryId(point.sopCategoryId);
                setEditingPoint(point);
                setSelectedPointId(point.id);
                setPointError(null);
                setPointOpen(true);
              }}
              onTogglePoint={togglePoint}
              onDuplicateCategory={(cat) => void duplicateCategory(cat)}
              onDuplicatePoint={(point) => void duplicatePoint(point)}
              onReorderCategory={(from, to) => void swapCategoryOrder(from, to)}
              onReorderPoint={(categoryId, from, to) => void swapPointOrder(categoryId, from, to)}
              busyId={busyId}
            />
          )}
        </section>

        <section className="space-y-2" aria-label="Detail item checklist">
          <h2 className="text-sm font-semibold sm:hidden">3. Detail Item</h2>
          {!selectedPoint && (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
              Pilih item pada pohon untuk melihat detailnya
            </p>
          )}
          {selectedPoint && (
            <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {editingTitle ? (
                    <div className="space-y-2">
                      <Input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        className="text-sm font-semibold"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveInlineTitle();
                          if (e.key === 'Escape') setEditingTitle(false);
                        }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => void saveInlineTitle()} disabled={savingInline}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingTitle(false)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startEditTitle}
                      className="group flex items-center gap-1 text-left"
                      title="Klik untuk mengubah judul"
                    >
                      <span className="text-sm font-semibold">{selectedPoint.title}</span>
                      <Pencil className="h-3 w-3 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                  <div className="mt-1">
                    <Select
                      value={selectedPoint.inputType}
                      onValueChange={(v) => void changeInputType(v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue>
                          {INPUT_TYPE_LABEL[selectedPoint.inputType] ?? selectedPoint.inputType}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(INPUT_TYPE_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Badge variant={selectedPoint.isActive ? 'default' : 'secondary'}>
                  {selectedPoint.isActive ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>

              {editingInstruction ? (
                <div className="space-y-2">
                  <Textarea
                    value={instructionDraft}
                    onChange={(e) => setInstructionDraft(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => void saveInlineInstruction()} disabled={savingInline}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingInstruction(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startEditInstruction}
                  className="group flex items-start gap-1 text-left"
                  title="Klik untuk mengubah petunjuk"
                >
                  {selectedPoint.instruction && (
                    <span className="text-sm text-ink-muted">{selectedPoint.instruction}</span>
                  )}
                  <Pencil className="h-3 w-3 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}

              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt className="text-ink-muted">Target</dt>
                <dd>{selectedPoint.targetTime ?? '-'}</dd>
                <dt className="text-ink-muted">Toleransi</dt>
                <dd>{selectedPoint.toleranceMinutes ?? '-'}</dd>
                <dt className="text-ink-muted">Wajib</dt>
                <dd>{selectedPoint.isRequired ? 'Ya' : 'Tidak'}</dd>
                <dt className="text-ink-muted">Urutan</dt>
                <dd>{selectedPoint.sortOrder}</dd>
                <dt className="text-ink-muted">Hari aktif</dt>
                <dd>{selectedPoint.activeDays || '-'}</dd>
              </dl>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPointCategoryId(selectedPoint.sopCategoryId);
                  setEditingPoint(selectedPoint);
                  setPointError(null);
                  setPointOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Ubah lengkap
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-2" aria-label="Pratinjau langsung">
          <h2 className="text-sm font-semibold">4. Pratinjau</h2>
          <div className="rounded-lg border border-border bg-surface p-3">
            {!shiftId ? (
              <p className="text-sm text-ink-muted">Pilih shift untuk melihat pratinjau</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-ink-muted">
                  Template seperti dilihat petugas:
                </p>
                {categories.length === 0 ? (
                  <p className="text-sm text-ink-muted">Belum ada konten</p>
                ) : (
                  <div className="space-y-2">
                    {categories
                      .filter((c) => c.isActive)
                      .map((cat) => (
                        <div key={cat.id} className="space-y-1">
                          <p className="text-xs font-semibold text-primary">{cat.name}</p>
                          <ul className="space-y-0.5">
                            {cat.points
                              .filter((p) => p.isActive)
                              .map((point) => (
                                <li key={point.id} className="text-xs text-ink-muted">
                                  <span className="mr-1">
                                    {point.inputType === 'centang' && '☐'}
                                    {point.inputType === 'foto' && '📷'}
                                    {point.inputType === 'teks' && '📝'}
                                    {point.inputType === 'angka' && '🔢'}
                                    {point.inputType === 'ok_tidak_ok' && '✓/✗'}
                                  </span>
                                  {point.title}
                                  {point.isRequired && <span className="text-danger"> *</span>}
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Ubah kategori SOP' : 'Tambah kategori SOP'}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (categoryName.trim().length < 2) return;
              void submitCategory({
                name: categoryName.trim(),
                sortOrder: categorySort,
                isActive: categoryActive,
              });
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label htmlFor="cb-category-name">Nama kategori</Label>
              <Input
                id="cb-category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="mis. Dapur"
                required
                minLength={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cb-category-sort">Urutan</Label>
                <Input
                  id="cb-category-sort"
                  type="number"
                  inputMode="numeric"
                  value={categorySort}
                  onChange={(e) => setCategorySort(Number(e.target.value) || 0)}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={categoryActive}
                  onChange={(e) => setCategoryActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Aktif
              </label>
            </div>
            {categoryError && <p className="text-sm text-danger">{categoryError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCategoryOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={savingCategory}>
                {savingCategory ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PointEditorDialog
        open={pointOpen}
        onOpenChange={setPointOpen}
        point={editingPoint}
        saving={savingPoint}
        error={pointError}
        onSubmit={submitPoint}
      />

      <ShiftPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        shiftId={shiftId}
      />
    </div>
  );
}
