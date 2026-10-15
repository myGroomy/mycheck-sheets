// app/admin/handover/layout.tsx
// Shell halaman Handover untuk ADMIN.
//
// Dua bagian dalam satu halaman, dipisah tab agar URL-nya bisa di-bookmark:
//   /admin/handover         -> riwayat handover yang sudah terjadi
//   /admin/handover/builder -> template field serah terima
//
// Petugas tidak punya akses ke sini; mereka memakai /handover yang hanya
// menampilkan riwayat.

import { HandoverSectionTabs } from '@/components/handover/handover-section-tabs';

export default function AdminHandoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-6 md:pb-10 lg:px-8 xl:px-10 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Handover</h1>
        <p className="text-xs text-ink-muted">
          Riwayat serah terima antar shift, plus pengelolaan bidang yang dipakai saat shift
          ditutup.
        </p>
      </div>
      <HandoverSectionTabs />
      {children}
    </div>
  );
}
