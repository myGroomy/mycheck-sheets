'use client';

import { useState } from 'react';
import { Copy, FolderPlus, GripVertical, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ChecklistPoint, SopCategory } from '@/lib/admin/api';

export type CategoryWithPoints = SopCategory & {
  points: ChecklistPoint[];
  canDelete?: boolean;
  hasChecklistPoints?: boolean;
};

interface CategoryTreeProps {
  categories: CategoryWithPoints[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
  onEditCategory: (category: SopCategory) => void;
  onToggleCategory: (category: SopCategory) => void;
  onDeleteCategory: (category: SopCategory) => void;
  onAddPoint: (categoryId: string) => void;
  onEditPoint: (point: ChecklistPoint) => void;
  onTogglePoint: (point: ChecklistPoint) => void;
  onDeletePoint: (point: ChecklistPoint) => void;
  onDuplicateCategory: (category: SopCategory) => void;
  onDuplicatePoint: (point: ChecklistPoint) => void;
  onReorderCategory: (from: number, to: number) => void;
  onReorderPoint: (categoryId: string, from: number, to: number) => void;
  busyId?: string | null;
  archivedView?: boolean;
  emptyMessage?: string;
}

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

/**
 * Editor Section + Question dengan drag & drop urutan (HTML5 native,
 * tanpa dependensi tambahan).
 */
export function CategoryTree({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  onEditCategory,
  onToggleCategory,
  onDeleteCategory,
  onAddPoint,
  onEditPoint,
  onTogglePoint,
  onDeletePoint,
  onDuplicateCategory,
  onDuplicatePoint,
  onReorderCategory,
  onReorderPoint,
  busyId,
  archivedView = false,
  emptyMessage,
}: CategoryTreeProps) {
  const [dragCategory, setDragCategory] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<{ categoryId: string; index: number } | null>(
    null
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Section</h2>
        {!archivedView && (
          <Button size="sm" className="min-h-12 px-4" onClick={onAddCategory}>
            <FolderPlus className="h-3.5 w-3.5" />
            Tambah section
          </Button>
        )}
      </div>

      {categories.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted">
          {emptyMessage ?? 'Belum ada section. Tambahkan section untuk mengelompokkan pertanyaan SOP.'}
        </p>
      )}

      <ul className="space-y-2">
        {categories.map((cat, catIndex) => (
          <li
            key={cat.id}
            draggable={!archivedView}
            onDragStart={() => !archivedView && setDragCategory(catIndex)}
            onDragOver={(e) => !archivedView && e.preventDefault()}
            onDrop={() => {
              if (!archivedView && dragCategory !== null) onReorderCategory(dragCategory, catIndex);
              setDragCategory(null);
            }}
            onDragEnd={() => setDragCategory(null)}
            className={`overflow-hidden rounded-xl border bg-surface ${
              selectedCategoryId === cat.id
                ? 'border-primary bg-primary/5'
                : 'border-border bg-surface'
            }`}
          >
            <div className="flex min-h-12 flex-wrap items-center gap-2 p-3">
              {!archivedView && (
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-muted" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className="min-w-[120px] flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{cat.name}</span>
                <span className="block text-sm text-ink-muted">
                  {cat.points.filter((p) => p.isActive).length} pertanyaan aktif
                </span>
              </button>
              <Badge className="shrink-0" variant={cat.isActive ? 'default' : 'secondary'}>
                {cat.isActive ? 'Aktif' : 'Nonaktif'}
              </Badge>
              <div className="ml-auto flex items-center gap-1.5">
                {!archivedView && <Button
                  size="sm"
                  variant="outline"
                  className="h-12 w-12 shrink-0 p-0"
                  aria-label={`Tambah item pada ${cat.name}`}
                  onClick={() => onAddPoint(cat.id)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>}
                {!archivedView && <Button
                  size="sm"
                  variant="outline"
                  className="h-12 w-12 shrink-0 p-0"
                  aria-label={`Duplikasi section ${cat.name}`}
                  disabled={busyId === cat.id}
                  onClick={() => onDuplicateCategory(cat)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>}
                {!archivedView && <Button
                  size="sm"
                  variant="outline"
                  className="h-12 w-12 shrink-0 p-0"
                  aria-label={`Ubah section ${cat.name}`}
                  onClick={() => onEditCategory(cat)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>}
                {(!archivedView || !cat.isActive) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-12 w-12 shrink-0 p-0"
                    aria-label={`${cat.isActive ? 'Arsipkan' : 'Pulihkan'} section ${cat.name}`}
                    onClick={() => onToggleCategory(cat)}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                )}
                {archivedView && !cat.isActive && cat.canDelete && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-12 w-12 shrink-0 p-0"
                    aria-label={`Hapus permanen section ${cat.name}`}
                    onClick={() => onDeleteCategory(cat)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {archivedView && !cat.isActive && !cat.canDelete && (
                  <span className="self-center text-xs text-ink-muted">
                    {cat.hasShiftHistory
                      ? 'Ada riwayat shift: hanya dapat dipulihkan'
                      : cat.hasChecklistPoints
                        ? 'Hapus item checklist terkait terlebih dahulu'
                        : 'Tidak dapat dihapus'}
                  </span>
                )}
              </div>
            </div>
            {cat.points.length > 0 && (
              <ul className="border-t border-border">
                {cat.points.map((point, pointIndex) => (
                  <li
                    key={point.id}
                    draggable={!archivedView}
                    onDragStart={() =>
                      !archivedView && setDragPoint({ categoryId: cat.id, index: pointIndex })
                    }
                    onDragOver={(e) => !archivedView && e.preventDefault()}
                    onDrop={() => {
                      if (!archivedView && dragPoint && dragPoint.categoryId === cat.id) {
                        onReorderPoint(cat.id, dragPoint.index, pointIndex);
                      }
                      setDragPoint(null);
                    }}
                    onDragEnd={() => setDragPoint(null)}
                    className="m-3 flex min-h-14 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    {!archivedView && (
                      <GripVertical
                        className="h-4 w-4 shrink-0 cursor-grab text-ink-muted"
                        aria-hidden
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectCategory(cat.id)}
                      className="min-w-[120px] flex-1 text-left"
                    >
                      <span className="block truncate text-sm">
                        {point.title}
                        {point.isRequired && <span className="text-danger"> *</span>}
                      </span>
                      <span className="block truncate text-sm text-ink-muted">
                        {(point.inputTypes?.length ? point.inputTypes : [point.inputType])
                          .map((type) => INPUT_TYPE_LABEL[type] ?? type)
                          .join(' + ')}
                        {point.targetTime ? ` · ${point.targetTime}` : ''}
                      </span>
                    </button>
                    {!point.isActive && (
                      <Badge className="shrink-0" variant="secondary">
                        Nonaktif
                      </Badge>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      {!archivedView && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-12 w-12 shrink-0 p-0"
                          aria-label={`Duplikasi pertanyaan ${point.title}`}
                          disabled={busyId === point.id}
                          onClick={() => onDuplicatePoint(point)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!archivedView && <Button
                        size="sm"
                        variant="outline"
                        className="h-12 w-12 shrink-0 p-0"
                        aria-label={`Ubah pertanyaan ${point.title}`}
                        onClick={() => onEditPoint(point)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-12 w-12 shrink-0 p-0"
                        aria-label={`${point.isActive ? 'Nonaktifkan' : 'Aktifkan'} pertanyaan ${point.title}`}
                        onClick={() => onTogglePoint(point)}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      {archivedView && point.canDelete && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-12 w-12 shrink-0 p-0"
                          aria-label={`Hapus permanen pertanyaan ${point.title}`}
                          onClick={() => onDeletePoint(point)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {archivedView && !point.canDelete && (
                        <span className="self-center text-xs text-ink-muted">
                          {cat.hasShiftHistory
                            ? 'Ada riwayat shift: hanya dapat dipulihkan'
                            : 'Masih direferensikan histori entry'}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
