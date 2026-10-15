// app/admin/handover/builder/page.tsx
// Tab "Builder" untuk admin: template bidang serah terima per definisi shift.
//
// Dipindahkan dari halaman mandiri /admin/handover-builder supaya admin punya
// satu tempat untuk melihat riwayat sekaligus mengelola template-nya.

import { HandoverBuilderSection } from '@/components/handover/handover-builder-section';
import { TemplateNotice } from '@/components/admin/template-notice';

export default function AdminHandoverBuilderPage() {
  return (
    <div className="space-y-4">
      <TemplateNotice />
      <HandoverBuilderSection />
    </div>
  );
}
