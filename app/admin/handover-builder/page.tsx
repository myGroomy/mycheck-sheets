// app/admin/handover-builder/page.tsx
// Route LAMA — builder sudah pindah ke /admin/handover/builder.
//
// File ini dipertahankan hanya sebagai pengalihan supaya bookmark dan tautan
// yang sudah dibagikan tidak rusak. Hapus setelah semua tautan lama diperbarui.

import { redirect } from 'next/navigation';

export default function LegacyHandoverBuilderPage() {
  redirect('/admin/handover/builder');
}
