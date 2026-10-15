'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmCloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Label tombol konfirmasi, default: "Ya, Tutup" */
  confirmLabel?: string;
  /** Pesan konfirmasi */
  message?: string;
  onConfirm: () => void;
}

export function ConfirmCloseDialog({
  open,
  onOpenChange,
  confirmLabel = 'Ya, Tutup',
  message = 'Data yang belum disimpan akan hilang. Tutup dialog?',
  onConfirm,
}: ConfirmCloseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            Tutup tanpa menyimpan?
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
