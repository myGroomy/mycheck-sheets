// app/admin/incident/page.tsx ADM-IN-01..04.
// Tabel incident lintas cabang + filter kategori/status/cabang/tanggal,
// ubah status, tambah catatan admin, dan tautkan ke shift.

import { IncidentList } from '@/components/incident/incident-list';

export default function IncidentAdminPage() {
  return (
    <div className="space-y-4">
      <IncidentList role="admin" />
    </div>
  );
}
