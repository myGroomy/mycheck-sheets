'use client';

// components/report/print-footer.tsx
// Fase 15: footer halaman cetak/PDF. position:fixed dalam konteks cetak
// membuat Chrome menuliskannya di TIAP halaman, memberi kertas laporan
// formal berlabel app · cabang · nomor laporan · waktu cetak.
// Hanya tampil saat print (hidden di layar).

export function PrintFooter({ label }: { label: string }) {
  return (
    <footer
      className="hidden print:fixed print:inset-x-0 print:bottom-0 print:z-10 print:flex print:items-center print:justify-between print:border-t print:border-border/60 print:bg-white print:px-[12mm] print:py-1.5 print:text-[10px] print:text-ink-muted"
      aria-hidden="true"
    >
      <span className="truncate">MyCheck · {label}</span>
      <span suppressHydrationWarning>Dicetak {new Date().toLocaleString('id-ID')}</span>
    </footer>
  );
}
