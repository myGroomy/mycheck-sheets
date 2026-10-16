// app/admin/incident/layout.tsx
// Shell halaman Incident untuk ADMIN.
//
// Dua bagian dalam satu halaman, dipisah tab agar URL-nya bisa di-bookmark:
//   /admin/incident          -> riwayat incident lintas cabang
//   /admin/incident/kategori -> pengelolaan kategori incident
//
// Petugas tidak punya akses ke sini; mereka memakai /incident yang hanya
// menampilkan daftar incident mereka.

import { IncidentSectionTabs } from '@/components/admin/incident-section-tabs';

export default function AdminIncidentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 sm:py-6 md:pb-10 lg:px-8 xl:px-10 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Incident</h1>
        <p className="text-xs text-ink-muted">
          Daftar incident lintas cabang dan pengelolaan kategori incident.
        </p>
      </div>
      <IncidentSectionTabs />
      {children}
    </div>
  );
}