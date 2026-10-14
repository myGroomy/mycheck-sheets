'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ArchiveFilter } from '@/components/admin/archive-filter';
import { canDeleteConfig } from '@/lib/admin/lifecycle-policy';
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
import { LoadingHint } from '@/components/ui/skeleton-transition';
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
  deleteCategory,
  deletePoint,
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
  centang: 'Centang checklist',
  foto: 'Foto',
  teks: 'Jawaban singkat',
  angka: 'Angka',
  ok_tidak_ok: 'OK / Tidak OK',
  paragraf: 'Paragraf',
  pilihan_ganda: 'Pilihan ganda',
  kotak_centang: 'Pilihan jamak',
  dropdown: 'Dropdown',
  tanggal_waktu: 'Tanggal dan waktu',
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
  const [showArchived, setShowArchived] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState('');

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
      .then((data) => setShifts(data.shifts))
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
      toast.error(err instanceof Error ? err.message : 'Gagal memuat section SOP');
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
        toast.success('Section diperbarui');
      } else {
        await createCategory(shiftId, values);
        toast.success('Section ditambahkan');
      }
      setCategoryOpen(false);
      await loadTree(shiftId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan section SOP';
      setCategoryError(message);
      toast.error(message);
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleCategory = async (cat: SopCategory) => {
    try {
      if (cat.isActive) {
        await updateCategory(cat.id, { isActive: false });
        toast.success('Kategori diarsipkan. Riwayat checklist tetap tersimpan.');
      } else {
        await updateCategory(cat.id, { isActive: true });
        toast.success('Kategori diaktifkan');
      }
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status section');
    }
  };

  const togglePoint = async (point: ChecklistPoint) => {
    try {
      if (point.isActive) {
        await updatePoint(point.id, { isActive: false });
        toast.success('Item diarsipkan. Riwayat checklist tetap tersimpan.');
      } else {
        await updatePoint(point.id, { isActive: true });
        toast.success('Item diaktifkan');
      }
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status item');
    }
  };

  const permanentlyDeleteCategory = async (cat: SopCategory) => {
    if (
      !window.confirm(
        `Hapus permanen section "${cat.name}"? Hanya bisa dilakukan bila belum dipakai dan tidak memiliki item checklist.`
      )
    ) return;
    setBusyId(cat.id);
    try {
      await deleteCategory(cat.id);
      if (selectedCategoryId === cat.id) setSelectedCategoryId(null);
      toast.success(`Section "${cat.name}" dihapus permanen`);
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Section tidak dapat dihapus');
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDeletePoint = async (point: ChecklistPoint) => {
    if (
      !window.confirm(
        `Hapus permanen item "${point.title}"? Hanya bisa dilakukan bila belum pernah dipakai oleh shift.`
      )
    ) return;
    setBusyId(point.id);
    try {
      await deletePoint(point.id);
      if (selectedPointId === point.id) setSelectedPointId(null);
      toast.success(`Item "${point.title}" dihapus permanen`);
      await loadTree(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Item tidak dapat dihapus');
    } finally {
      setBusyId(null);
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
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pertanyaan';
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
      toast.error(err instanceof Error ? err.message : 'Gagal menduplikasi section');
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
      toast.success('Urutan section diperbarui');
    } catch (err) {
      setCategories(prev);
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah urutan section');
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

  const normalizedArchiveQuery = archiveQuery.trim().toLowerCase();
  const visibleCategories = categories
    .filter((category) =>
      showArchived
        ? !category.isActive || category.points.some((point) => !point.isActive)
        : category.isActive
    )
    .map((category) => {
      const categoryMatches = category.name.toLowerCase().includes(normalizedArchiveQuery);
      const points = category.points.filter((point) =>
        point.isActive !== showArchived &&
        (!showArchived || categoryMatches || point.title.toLowerCase().includes(normalizedArchiveQuery))
      );
      return {
        ...category,
        // Kelayakan hapus kategori mengikuti policy yang sama dengan route DELETE.
        canDelete: canDeleteConfig('sop_category', {
          isActive: category.isActive,
          hasShiftHistory: category.hasShiftHistory === true,
          hasChildren: category.points.length > 0,
        }),
        hasChecklistPoints: category.points.length > 0,
        points,
      };
    })
    .filter((category) =>
      !showArchived ||
      normalizedArchiveQuery.length === 0 ||
      category.name.toLowerCase().includes(normalizedArchiveQuery) ||
      category.points.length > 0
    );
  const selectedPoint = visibleCategories
    .flatMap((category) => category.points)
    .find((point) => point.id === selectedPointId) ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 pb-24 sm:px-6 sm:py-7 md:pb-10 lg:px-8 xl:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Form Builder SOP</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            Susun section dan pertanyaan SOP per shift. Tambahkan sebanyak mungkin pertanyaan
            dalam setiap section.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-12 px-5"
          disabled={!shiftId}
          onClick={() => setPreviewOpen(true)}
        >
          <ExternalLink className="h-4 w-4" />
          Pratinjau
        </Button>
      </div>

      <TemplateNotice />
      <ArchiveFilter
        archived={showArchived}
        onChange={(archived) => {
          setShowArchived(archived);
          setArchiveQuery('');
          setShiftId((current) =>
            shifts.some((shift) => shift.id === current && shift.isActive !== archived)
              ? current
              : ''
          );
          setSelectedCategoryId(null);
          setSelectedPointId(null);
        }}
        activeCount={categories.reduce(
          (total, category) => total + Number(category.isActive) + category.points.filter((point) => point.isActive).length,
          0
        )}
        archivedCount={categories.reduce(
          (total, category) => total + Number(!category.isActive) + category.points.filter((point) => !point.isActive).length,
          0
        )}
        searchValue={archiveQuery}
        onSearchChange={setArchiveQuery}
        searchPlaceholder="Cari section atau item checklist arsip..."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,2fr)] xl:gap-5">
        <section
          className="space-y-4 rounded-lg border border-border bg-surface p-4"
          aria-label="Pilih cabang dan shift"
        >
          <h2 className="text-sm font-semibold">Cabang dan shift</h2>
          <div className="space-y-2">
            <label htmlFor="cb-branch" className="text-sm font-medium text-ink-muted">
              Cabang
            </label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="cb-branch" className="min-h-12">
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
          <div className="space-y-2">
            <label htmlFor="cb-shift" className="text-sm font-medium text-ink-muted">
              Shift
            </label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger id="cb-shift" className="min-h-12">
                <SelectValue placeholder="Pilih shift" />
              </SelectTrigger>
              <SelectContent>
                {shifts.filter((shift) => shift.isActive !== showArchived).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime}){showArchived ? ' · Arsip' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm leading-6 text-ink-muted">
            Definisi shift dibuat di halaman <span className="font-medium">Shift</span>.
          </p>
        </section>

        <section
          className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-4 xl:col-start-2 xl:row-span-2"
          aria-label="Form builder section dan pertanyaan"
        >
          {!shiftId && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted">
              Pilih shift untuk mulai menyusun formulir SOP
            </p>
          )}
          {shiftId && loading && <LoadingHint className="justify-start p-0">Memuat formulir…</LoadingHint>}
          {shiftId && !loading && (
            <CategoryTree
              categories={visibleCategories}
              archivedView={showArchived}
              emptyMessage={showArchived ? 'Belum ada konfigurasi di arsip.' : 'Belum ada section aktif.'}
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
              onDeleteCategory={(category) => void permanentlyDeleteCategory(category)}
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
              onDeletePoint={(point) => void permanentlyDeletePoint(point)}
              onDuplicateCategory={(cat) => void duplicateCategory(cat)}
              onDuplicatePoint={(point) => void duplicatePoint(point)}
              onReorderCategory={(from, to) => void swapCategoryOrder(from, to)}
              onReorderPoint={(categoryId, from, to) => void swapPointOrder(categoryId, from, to)}
              busyId={busyId}
            />
          )}
        </section>

        <section
          className="hidden"
          aria-label="Detail pertanyaan checklist"
        >
          <h2 className="text-sm font-semibold">Detail Item</h2>
          {!selectedPoint && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted">
              Pilih item pada pohon untuk melihat detailnya
            </p>
          )}
          {selectedPoint && (
            <div className="space-y-3">
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
                  <p className="mt-1 text-sm text-ink-muted">
                    {(selectedPoint.inputTypes?.length ? selectedPoint.inputTypes : [selectedPoint.inputType])
                      .map((type) => INPUT_TYPE_LABEL[type] ?? type)
                      .join(' + ')}
                  </p>
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

      </div>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Ubah section' : 'Tambah section'}
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
              <Label htmlFor="cb-category-name">Nama section</Label>
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
