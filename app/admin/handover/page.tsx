// app/admin/handover/page.tsx
// Tab "Riwayat" untuk admin: daftar handover yang sudah terjadi.
//
// Isinya sama dengan yang dilihat petugas di /handover, ditambah filter
// cabang (admin biasanya punya akses ke lebih dari satu cabang).

import { HandoverHistory } from '@/components/handover/handover-history';

export default function AdminHandoverHistoryPage() {
  // Layout /admin/handover sudah punya header "Handover" sendiri,
  // jadi komponen cukup merender daftar + filter cabang.
  return <HandoverHistory showBranchFilter showHeader={false} />;
}
