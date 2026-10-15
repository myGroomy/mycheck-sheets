'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Judul dialog, mis. "Hapus Akun", "Hapus Cabang" */
  title: string;
  /** Nama item yang akan ditampilkan sebagai konfirmasi ketik */
  itemName: string;
  /** Deskripsi dampak penghapusan */
  impact: string;
  /** Label tombol konfirmasi, default: "Ya, Hapus" */
  confirmLabel?: string;
  /** Loading state saat proses hapus */
  loading?: boolean;
  /** Error message dari parent */
  error?: string | null;
  /** Saat true, user harus mengetik nama item untuk konfirmasi (untuk item kritis) */
  requireTypeConfirm?: boolean;
  /** Callback saat konfirmasi */
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  itemName,
  impact,
  confirmLabel = 'Ya, Hapus',
  loading = false,
  error,
  requireTypeConfirm = false,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [typedName, setTypedName] = useState('');

  // Reset isian setiap kali dialog dibuka
  useEffect(() => {
    if (open) {
      setTypedName('');
    }
  }, [open]);

  // Validasi: tombol konfirmasi hanya aktif jika semua syarat terpenuhi
  const canConfirm = useMemo(() => {
    if (loading) return false;
    if (requireTypeConfirm && typedName !== itemName) return false;
    return true;
  }, [loading, requireTypeConfirm, typedName, itemName]);

  // Auto-clear error saat user mulai mengetik
  useEffect(() => {
    if (error && typedName.length > 0) {
      // Parent akan clear error saat onOpenChange dipanggil
    }
  }, [typedName, error]);

  const handleClose = () => {
    if (loading) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-error">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-ink">
              <span className="mb-1 block font-semibold uppercase tracking-wide">
                Dampak penghapusan
              </span>
              {impact}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-error-bg p-3 text-xs font-medium text-error"
            >
              {error}
            </div>
          )}

          <div className="space-y-1 rounded-lg border border-border bg-canvas p-3 text-sm">
            <p>
              <span className="font-medium">Item:</span> {itemName}
            </p>
            <p className="text-xs text-ink-muted">
              Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>

          {requireTypeConfirm && (
            <div className="space-y-1">
              <label
                htmlFor="confirm-delete-input"
                className="text-sm font-medium"
              >
                Ketik <span className="font-semibold text-error">{itemName}</span>{' '}
                untuk konfirmasi
              </label>
              <Input
                id="confirm-delete-input"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={itemName}
                disabled={loading}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {loading ? (
              <>
                <Trash2 className="mr-2 h-4 w-4 animate-pulse" />
                Menghapus...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {confirmLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
