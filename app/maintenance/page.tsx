// app/maintenance/page.tsx
// Halaman yang ditampilkan saat maintenance_mode = TRUE dan user bukan admin.

import { Wrench } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <Wrench className="mx-auto h-12 w-12 text-ink-muted" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-ink">Sedang maintenance</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Aplikasi sedang dalam perawatan. Silakan coba lagi nanti.
        </p>
        <p className="mt-4 text-xs text-ink-light">
          Admin: silakan masuk ke /admin/pengaturan untuk menonaktifkan mode maintenance.
        </p>
      </div>
    </div>
  );
}
