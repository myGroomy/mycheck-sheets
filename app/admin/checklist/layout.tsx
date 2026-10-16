// app/admin/checklist/layout.tsx
// Shell halaman Checklist untuk ADMIN.
//
// Dua bagian dalam satu halaman, dipisah tab agar URL-nya bisa di-bookmark:
//   /admin/checklist          -> riwayat eksekusi checklist (mirip petugas, read-mostly)
//   /admin/checklist/builder  -> form builder SOP per shift
//
// Petugas tidak punya akses ke sini; mereka memakai /daftar-shift dan /report.

import { ChecklistSectionTabs } from '@/components/admin/checklist-section-tabs';

export default function AdminChecklistLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-6 md:pb-10 lg:px-8 xl:px-10 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Checklist</h1>
        <p className="text-xs text-ink-muted">
          Riwayat eksekusi checklist dan pengelolaan formulir SOP per shift.
        </p>
      </div>
      <ChecklistSectionTabs />
      {children}
    </div>
  );
}