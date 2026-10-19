'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ArchiveFilter } from '@/components/admin/archive-filter';
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
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useAutoSaveDraft } from '@/hooks/use-auto-save-draft';
import {
  checklistBuilderReducer,
  INITIAL_CHECKLIST_BUILDER_STATE,
} from '@/lib/reducers/checklist-builder-reducer';
import {
  createCategory,
  createPoint,
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
  color: string;
}

export default function ChecklistBuilderPage() {
  const [state, dispatch] = useReducer(checklistBuilderReducer, INITIAL_CHECKLIST_BUILDER_STATE);
  const {
    branches,
    branchId,
    shifts,
    shiftId,
    categories,
    selectedCategoryId,
    selectedPointId,
    loading,
    categoryOpen,
    editingCategory,
    categoryName,
    categorySort,
    categoryActive,
    categoryColor,
    savingCategory,
    categoryError,
    pointOpen,
    editingPoint,
    savingPoint,
    pointError,
    previewOpen,
    busyId,
    showArchived,
    archiveQuery,
    editingTitle,
    editingInstruction,
    titleDraft,
    instructionDraft,
    savingInline,
  } = state;

  // Helper dispatches
  const setBranches = (v: AdminBranch[]) => dispatch({ type: 'SET_DATA', payload: { branches: v } });
  const setBranchId = (v: string) => dispatch({ type: 'SET_DATA', payload: { branchId: v } });
  const setShifts = (v: ShiftDefinition[]) => dispatch({ type: 'SET_DATA', payload: { shifts: v } });
  const setShiftId = (v: string) => dispatch({ type: 'SET_DATA', payload: { shiftId: v } });
  const setLoading = (v: boolean) => dispatch({ type: 'SET_LOADING', payload: v });
  const setSelectedCategoryId = (v: string | null) => dispatch({ type: 'SELECT_CATEGORY', payload: v });
  const setSelectedPointId = (v: string | null) => dispatch({ type: 'SELECT_POINT', payload: v });
  const setCategoryOpen = (v: boolean) => dispatch({ type: 'TOGGLE_CATEGORY_FORM', payload: { open: v, category: v ? editingCategory : null } });
  const setCategoryName = (v: string) => dispatch({ type: 'UPDATE_CATEGORY_DRAFT', payload: { categoryName: v } });
  const setCategorySort = (v: number) => dispatch({ type: 'UPDATE_CATEGORY_DRAFT', payload: { categorySort: v } });
  const setCategoryActive = (v: boolean) => dispatch({ type: 'UPDATE_CATEGORY_DRAFT', payload: { categoryActive: v } });
  const setCategoryColor = (v: string) => dispatch({ type: 'UPDATE_CATEGORY_DRAFT', payload: { categoryColor: v } });
  const setSavingCategory = (v: boolean) => dispatch({ type: 'SET_SAVING', payload: { field: 'category', value: v } });
  const setCategoryError = (v: string | null) => dispatch({ type: 'SET_ERROR', payload: { field: 'category', value: v } });
  const setPointOpen = (v: boolean) => dispatch({ type: 'TOGGLE_POINT_FORM', payload: { open: v, point: v ? editingPoint : null, categoryId: null } });
  const setEditingPoint = (v: ChecklistPoint | null) => dispatch({ type: 'SET_DATA', payload: { editingPoint: v } });
  const setSavingPoint = (v: boolean) => dispatch({ type: 'SET_SAVING', payload: { field: 'point', value: v } });
  const setPointError = (v: string | null) => dispatch({ type: 'SET_ERROR', payload: { field: 'point', value: v } });
  const setPreviewOpen = (v: boolean) => dispatch({ type: 'TOGGLE_PREVIEW', payload: v });
  const setBusyId = (v: string | null) => dispatch({ type: 'SET_BUSY_ID', payload: v });
  const setArchiveQuery = (v: string) => dispatch({ type: 'SET_ARCHIVE', payload: { showArchived, query: v } });
  const setEditingTitle = (v: boolean) => dispatch({ type: 'SET_DATA', payload: { editingTitle: v } });
  const setEditingInstruction = (v: boolean) => dispatch({ type: 'SET_DATA', payload: { editingInstruction: v } });
  const setTitleDraft = (v: string) => dispatch({ type: 'UPDATE_INLINE_DRAFT', payload: { titleDraft: v } });
  const setInstructionDraft = (v: string) => dispatch({ type: 'UPDATE_INLINE_DRAFT', payload: { instructionDraft: v } });
  const setSavingInline = (v: boolean) => dispatch({ type: 'SET_SAVING', payload: { field: 'inline', value: v } });
  const [pointCategoryId, setPointCategoryId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<ChecklistPoint | null>(null);

  // Unsaved changes detection
  const isDirty = categoryName.trim() !== '' || titleDraft !== '' || instructionDraft !== '';
  useUnsavedChanges(isDirty);

  // Auto-save draft (hanya draft teks, bukan data yang sudah tersimpan)
  const { savedAt: draftSavedAt, clearDraft, readDraft } = useAutoSaveDraft({
    key: 'mycheck.checklist-builder.draft',
    isDirty,
    getValue: () => ({
      categoryName,
      categorySort,
      categoryActive,
      categoryColor,
      titleDraft,
      instructionDraft,
    }),
  });

  const restoreDraft = () => {
    const draft = readDraft();
    if (!draft) return;
    dispatch({
      type: 'UPDATE_CATEGORY_DRAFT',
      payload: {
        categoryName: draft.value.categoryName ?? '',
        categorySort: draft.value.categorySort ?? 0,
        categoryActive: draft.value.categoryActive ?? true,
        categoryColor: draft.value.categoryColor ?? '',
      },
    });
    dispatch({
      type: 'UPDATE_INLINE_DRAFT',
      payload: {
        titleDraft: draft.value.titleDraft ?? '',
        instructionDraft: draft.value.instructionDraft ?? '',
      },
    });
    dispatch({ type: 'TOGGLE_CATEGORY_FORM', payload: { open: true, category: null } });
  };

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const data = await listBranches();
        const active = data.branches.filter((b) => b.isActive);
        setBranches(active);
        if (active.length > 0) {
          setBranchId(branchId || active[0].id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Gagal memuat cabang');
      }
    };
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      dispatch({ type: 'SET_DATA', payload: { categories: [] } });
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
      dispatch({ type: 'SET_DATA', payload: { categories: withPoints } });
      setSelectedCategoryId(
        selectedCategoryId && withPoints.some((c) => c.id === selectedCategoryId)
          ? selectedCategoryId
          : (withPoints[0]?.id ?? null)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat section SOP');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]);

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
      dispatch({ type: 'TOGGLE_CATEGORY_FORM', payload: { open: false, category: null } });
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
    if (cat.isActive && !window.confirm(`Hapus section "${cat.name}" dari daftar aktif? Riwayat checklist tetap disimpan.`)) return;
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
    if (point.isActive && !window.confirm(`Hapus item checklist "${point.title}" dari daftar aktif? Riwayat tetap disimpan.`)) return;
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
      dispatch({ type: 'TOGGLE_POINT_FORM', payload: { open: false, point: null, categoryId: null } });
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
    const next = [...prev];
    next[from] = b;
    next[to] = a;
    dispatch({ type: 'SET_DATA', payload: { categories: next } });
    try {
      await updateCategory(a.id, { sortOrder: b.sortOrder ?? 0 });
      await updateCategory(b.id, { sortOrder: a.sortOrder ?? 0 });
      toast.success('Urutan section diperbarui');
    } catch (err) {
      dispatch({ type: 'SET_DATA', payload: { categories: prev } });
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah urutan section');
    }
  };

  const swapPointOrder = async (catId: string, from: number, to: number) => {
    const cat = categories.find((c) => c.id === catId);
    const a = cat?.points[from];
    const b = cat?.points[to];
    if (!cat || !a || !b) return;
    const prev = categories;
    const next = prev.map((c) => {
      if (c.id !== catId) return c;
      const points = [...c.points];
      points[from] = b;
      points[to] = a;
      return { ...c, points };
    });
    dispatch({ type: 'SET_DATA', payload: { categories: next } });
    try {
      await updatePoint(a.id, { sortOrder: b.sortOrder });
      await updatePoint(b.id, { sortOrder: a.sortOrder });
      toast.success('Urutan item diperbarui');
    } catch (err) {
      dispatch({ type: 'SET_DATA', payload: { categories: prev } });
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah urutan item');
    }
  };

  // Inline editing helpers
  const startEditTitle = () => {
    if (!selectedPoint) return;
    dispatch({ type: 'START_INLINE_EDIT_TITLE', payload: selectedPoint.title });
  };

  const startEditInstruction = () => {
    if (!selectedPoint) return;
    dispatch({ type: 'START_INLINE_EDIT_INSTRUCTION', payload: selectedPoint.instruction ?? '' });
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
      dispatch({ type: 'SET_DATA', payload: { editingTitle: false, titleDraft: '' } });
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
      dispatch({ type: 'SET_DATA', payload: { editingInstruction: false, instructionDraft: '' } });
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
  if (selectedPoint && selectedPoint.id !== selectedPointId) {
    setSelectedPoint(null);
  }
  if (!selectedPoint && selectedPointId) {
    const found = visibleCategories
      .flatMap((category) => category.points)
      .find((point) => point.id === selectedPointId);
    if (found) setSelectedPoint(found);
  }

  return (
    <div className="space-y-6">
      {/* Header (h1 + padding) TIDAK dirender di sini — sudah dipegang oleh
          app/admin/checklist/layout.tsx bersama tab-nya. Dulunya builder ini
          punya header sendiri, tapi setelah pindah jadi sub-route halaman
          yang punya layout itu, header ganda akan muncul. */}
      <div className="flex flex-wrap items-center justify-end gap-4">
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

      {/* Indikator draft tersimpan + aksi draft */}
      {(draftSavedAt || isDirty) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-canvas px-3 py-2 text-xs text-ink-muted">
          <span>
            {draftSavedAt
              ? `Draft tersimpan ${new Date(draftSavedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
              : 'Ada isian yang belum disimpan'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={restoreDraft}>
              Mulai dari draft
            </Button>
            <Button variant="ghost" size="sm" onClick={clearDraft}>
              Hapus draft
            </Button>
          </div>
        </div>
      )}

      <ArchiveFilter
        archived={showArchived}
        onChange={(archived) => {
          dispatch({ type: 'SET_ARCHIVE', payload: { showArchived: archived, query: '' } });
          setShiftId(
            shifts.some((shift) => shift.id === shiftId && shift.isActive !== archived)
              ? shiftId
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
                dispatch({ type: 'TOGGLE_CATEGORY_FORM', payload: { open: true, category: null } });
              }}
              onEditCategory={(cat) => {
                dispatch({ type: 'START_EDIT_CATEGORY', payload: cat });
              }}
              onToggleCategory={toggleCategory}
              onAddPoint={(categoryId) => {
                setPointCategoryId(categoryId);
                dispatch({ type: 'TOGGLE_POINT_FORM', payload: { open: true, point: null, categoryId } });
              }}
              onEditPoint={(point) => {
                setPointCategoryId(point.sopCategoryId);
                setSelectedPointId(point.id);
                dispatch({ type: 'START_EDIT_POINT', payload: point });
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
                color: categoryColor,
              });
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label htmlFor="cb-category-name">Nama section</Label>
              <Input
                id="cb-category-name"
                value={categoryName}
                onChange={(e) => { setCategoryName(e.target.value); setCategoryError(null); }}
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
                  onChange={(e) => { setCategorySort(Number(e.target.value) || 0); setCategoryError(null); }}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={categoryActive}
                  onChange={(e) => { setCategoryActive(e.target.checked); setCategoryError(null); }}
                  className="h-4 w-4"
                />
                Aktif
              </label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cb-category-color">Warna section</Label>
              <div className="flex items-center gap-2">
                <input
                  id="cb-category-color"
                  type="color"
                  value={categoryColor || '#9ca3af'}
                  onChange={(e) => { setCategoryColor(e.target.value); setCategoryError(null); }}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-surface p-0.5"
                  aria-label="Warna section (hex)"
                />
                <Input
                  value={categoryColor}
                  onChange={(e) => { setCategoryColor(e.target.value); setCategoryError(null); }}
                  placeholder="#4ade80"
                  className="w-28 font-mono text-xs"
                  aria-label="Kode warna hex"
                />
                {categoryColor && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCategoryColor('')}
                    title="Kembali ke warna default (abu-abu)"
                  >
                    Default
                  </Button>
                )}
              </div>
              <p className="text-xs text-ink-muted">Kosong = default abu-abu. Dipakai pada header section di checklist &amp; laporan.</p>
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
        onClearError={() => setPointError(null)}
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
