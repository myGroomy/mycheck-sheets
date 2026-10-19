'use client';

// components/shared/notification-bell.tsx
// Fase 14: lonceng notifikasi — daftar 50 event operasional terbaru
// (buka/tutup shift, isi item, sinkronisasi, incident), badge jumlah
// belum dibaca, deep-link ke tujuan, dan tandai sudah dibaca saat dibuka.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing } from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: string;
  payload: { title: string; body: string; link: string | null };
  read_at: string | null;
  created_at: string;
}

function relativeAge(iso: string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s} dtk`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam`;
  return `${Math.floor(s / 86400)} hari`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { headers: { 'X-Requested-With': 'fetch' } });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: NotificationItem[] };
      setItems(data.items ?? []);
    } catch {
      // polling diam-diam gagal — coba pada tick berikutnya
    }
  }, []);

  useEffect(() => {
    // Muat pertama + polling tiap 60 detik.
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const onOpenMenu = () => {
    setOpen((v) => !v);
    void load();
  };

  const onItemOpen = async (item: NotificationItem) => {
    setOpen(false);
    if (item.payload.link) router.push(item.payload.link);
    if (!item.read_at) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: n.created_at } : n)));
      try {
        await fetch(`/api/notifications/${item.id}/read`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'fetch' },
        });
      } catch {
        // tetap navigasi walau mark-read gagal; polling akan membetulkan state
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={unreadCount > 0 ? `Notifikasi, ${unreadCount} belum dibaca` : 'Notifikasi'}
        aria-expanded={open}
        className="relative inline-flex h-9 items-center justify-center rounded-full border border-border bg-surface p-2 text-ink hover:bg-canvas"
      >
        {unreadCount > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Daftar notifikasi"
          className="absolute right-0 z-50 mt-2 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {items.length === 0 ? (
            <p className="p-3 text-sm text-ink-muted">Belum ada notifikasi.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void onItemOpen(n)}
                    className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas ${
                      n.read_at ? 'opacity-70' : ''
                    }`}
                  >
                    {!n.read_at && (
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{n.payload.title}</span>
                      <span className="block text-xs text-ink-muted">{n.payload.body}</span>
                      <span className="block text-[10px] text-ink-muted">{relativeAge(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
