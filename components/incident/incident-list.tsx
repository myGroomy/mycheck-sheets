'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Link2Off, MessageSquarePlus, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveRecordCards } from '@/components/ui/responsive-record-cards';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonTransition } from '@/components/ui/skeleton-transition';
import { apiFetch } from '@/lib/admin/api';

interface Incident {
  id: string;
  branchId: string;
  branchName: string;
  categoryId?: string;
  categoryName: string;
  description: string;
  occurredAt: string;
  reportedAt: string;
  reportedByName?: string;
  reportedBy?: string;
  status: 'open' | 'selesai';
  severity: 'rendah' | 'sedang' | 'tinggi' | null;
  outsideShift?: boolean;
  shiftInstanceId: string | null;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface IncidentCategory {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  selesai: 'Selesai',
};

function SkeletonIncidentList({ count = 4 }: { count?: number }) {
  return (
    <SkeletonTransition>
      <div className="space-y-3" role="status" aria-label="Memuat daftar incident">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonTransition>
  );
}

export interface IncidentListProps {
  role?: 'admin' | 'petugas';
}

export function IncidentList({ role = 'petugas' }: IncidentListProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<IncidentCategory[]>([]);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Admin specific filters & settings
  const [linkWindowHours, setLinkWindowHours] = useState<number | null>(null);
  const [linkWindowSaving, setLinkWindowSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'semua' | 'open' | 'selesai'>('semua');
  const [categoryFilter, setCategoryFilter] = useState('semua');
  const [branchFilter, setBranchFilter] = useState('semua');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Dialog catatan admin
  const [noteTarget, setNoteTarget] = useState<Incident | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (role === 'admin') {
        const [incidentRes, settingsRes] = await Promise.all([
          apiFetch<{ incidents: Incident[]; branches?: Branch[] }>('/api/incidents'),
          apiFetch<{ settings: { key: string; value: string | number | boolean }[] }>(
            '/api/admin/settings'
          ),
        ]);
        setIncidents(incidentRes.incidents);
        setBranches(incidentRes.branches ?? []);
        const linkWindow = settingsRes.settings.find((s) => s.key === 'incident_link_window_hours');
        setLinkWindowHours(linkWindow ? Number(linkWindow.value) : null);
      } else {
        const response = await fetch('/api/incidents', {
          headers: { 'X-Requested-With': 'fetch' },
        });
        const result = (await response.json()) as {
          error?: string;
          branches?: Branch[];
          incidents?: Incident[];
        };
        if (!response.ok) throw new Error(result.error || 'Gagal memuat incident.');
        setBranches(result.branches ?? []);
        setIncidents(result.incidents ?? []);
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Gagal memuat incident.';
      setError(msg);
      if (role === 'admin') toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [role]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    const fetcher = role === 'admin' ? apiFetch<{ incidents: Incident[] }>('/api/incidents') : fetch('/api/incidents', { cache: 'reload', headers: { 'X-Requested-With': 'fetch' } }).then(async r => r.json());
    Promise.resolve(fetcher)
      .then((res: any) => {
        setIncidents(res.incidents ?? []);
        if (res.branches) setBranches(res.branches);
      })
      .catch((cause: unknown) => {
        const msg = cause instanceof Error ? cause.message : 'Gagal memuat incident.';
        setError(msg);
        if (role === 'admin') toast.error(msg);
      })
      .finally(() => setRefreshing(false));
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (role === 'admin') {
      apiFetch<{ categories: IncidentCategory[] }>('/api/admin/incident-categories')
        .then((r) => setCategories(r.categories))
        .catch(() => setCategories([]));
    }
  }, [role]);

  const saveLinkWindow = async () => {
    if (linkWindowHours === null) return;
    setLinkWindowSaving(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        json: {
          settings: [{ key: 'incident_link_window_hours', value: String(linkWindowHours) }],
        },
      });
      toast.success('Jendela tautan shift disimpan');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan jendela tautan');
    } finally {
      setLinkWindowSaving(false);
    }
  };

  const setStatus = async (incident: Incident, status: 'open' | 'selesai') => {
    setBusyId(incident.id);
    try {
      const res = await apiFetch<{ status: string }>(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        json: { status },
      });
      toast.success(
        res.status === 'tidak_berubah' ? 'Status sudah sama' : 'Status incident diperbarui'
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status');
    } finally {
      setBusyId(null);
    }
  };

  const unlinkShift = async (incident: Incident) => {
    setBusyId(incident.id);
    try {
      await apiFetch(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        json: { unlink: true },
      });
      toast.success('Incident dilepas dari shift, berdiri sendiri');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal melepas tautan');
    } finally {
      setBusyId(null);
    }
  };

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTarget) return;
    setNoteLoading(true);
    setNoteError(null);
    try {
      await apiFetch(`/api/incidents/${noteTarget.id}/notes`, {
        method: 'POST',
        json: { note: noteText.trim() },
      });
      toast.success('Catatan admin ditambahkan');
      setNoteTarget(null);
      setNoteText('');
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Gagal menambah catatan');
    } finally {
      setNoteLoading(false);
    }
  };

  const branchOptions = [...new Map(incidents.map((i) => [i.branchId, i.branchName])).entries()];

  const visible = incidents.filter((i) => {
    if (role === 'admin') {
      if (statusFilter !== 'semua' && i.status !== statusFilter) return false;
      if (categoryFilter !== 'semua' && i.categoryId !== categoryFilter) return false;
      if (branchFilter !== 'semua' && i.branchId !== branchFilter) return false;
      if (dateFrom && i.reportedAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && i.reportedAt.slice(0, 10) > dateTo) return false;
      if (query) {
        const q = query.toLowerCase();
        const reporterName = i.reportedBy || i.reportedByName || '';
        const hay = `${i.description} ${i.categoryName} ${i.branchName} ${reporterName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    } else {
      return !branchId || i.branchId === branchId;
    }
  });

  const openCount = visible.filter((i) => i.status === 'open').length;

  if (role === 'admin') {
    return (
      <div className="space-y-4">
        <p className="text-xs text-ink-muted">
          {openCount} masih open dari {visible.length} tampil
        </p>

        {/* Pengaturan jendela tautan shift (ADM-IN-05) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pengaturan Tautan Shift Incident</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="link-window-hours">
                Jendela tautan setelah shift berakhir (jam)
              </Label>
              <Input
                id="link-window-hours"
                type="number"
                value={linkWindowHours ?? ''}
                onChange={(e) => setLinkWindowHours(Number(e.target.value) || null)}
                min="0"
                disabled={loading || linkWindowSaving}
                className="w-32"
              />
              <p className="text-xs text-ink-light">
                Incident yang dilaporkan lebih dari jendela ini setelah shift
                berakhir akan dianggap &quot;Di luar shift&quot; dan tidak dapat
                ditautkan ke shift tersebut.
              </p>
            </div>
            <Button
              onClick={saveLinkWindow}
              disabled={linkWindowSaving || linkWindowHours === null}
            >
              {linkWindowSaving ? 'Menyimpan...' : 'Simpan Jendela'}
            </Button>
          </CardContent>
        </Card>

        {/* Filter (ADM-IN-01) */}
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filter incident
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            {filtersOpen ? 'Sembunyikan' : 'Tampilkan'}
          </Button>
        </div>
        <div className={`${filtersOpen ? 'grid' : 'hidden'} gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5`}>
          <div className="relative lg:col-span-2">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-light"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari isi / kategori / pelapor"
              className="pl-9"
              aria-label="Cari incident"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger aria-label="Filter status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="selesai">Selesai</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger aria-label="Filter kategori">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger aria-label="Filter cabang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua cabang</SelectItem>
              {branchOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="max-w-[10rem]"
              aria-label="Tanggal mulai"
            />
            <span className="text-xs text-ink-light">sampai</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="max-w-[10rem]"
              aria-label="Tanggal akhir"
            />
            {(dateFrom || dateTo || query || statusFilter !== 'semua' || categoryFilter !== 'semua' || branchFilter !== 'semua') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('semua');
                  setCategoryFilter('semua');
                  setBranchFilter('semua');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                Reset filter
              </Button>
            )}
          </div>
        </div>

        <ResponsiveRecordCards
          loading={loading}
          emptyMessage="Tidak ada incident yang cocok"
          records={visible.map((i) => ({
            key: i.id,
            title: i.categoryName || 'Incident',
            subtitle: i.branchName,
            status: (
              <Badge variant={i.status === 'open' ? 'default' : 'secondary'}>
                {STATUS_LABEL[i.status] ?? i.status}
              </Badge>
            ),
            fields: [
              {
                label: 'Isi incident',
                value: (
                  <div className="space-y-1">
                    <p className="whitespace-pre-wrap">{i.description}</p>
                    {i.outsideShift && <Badge variant="secondary">Di luar shift</Badge>}
                  </div>
                ),
              },
              {
                label: 'Tingkat keparahan',
                value: i.severity ? <Badge variant="outline">{i.severity}</Badge> : '—',
              },
              {
                label: 'Dilaporkan',
                value: (
                  <div>
                    <p>{i.reportedAt.slice(0, 16).replace('T', ' ')}</p>
                    <p className="text-xs text-ink-light">{i.reportedBy || i.reportedByName}</p>
                  </div>
                ),
              },
              { label: 'Waktu kejadian', value: i.occurredAt.slice(0, 16).replace('T', ' ') },
              { label: 'ID cabang', value: i.branchId },
              { label: 'ID shift', value: i.shiftInstanceId ?? '—' },
            ],
            actions: (
              <>
                {i.status === 'open' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === i.id}
                    onClick={() => setStatus(i, 'selesai')}
                  >
                    Tandai Selesai
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === i.id}
                    onClick={() => setStatus(i, 'open')}
                  >
                    Buka Kembali
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNoteTarget(i);
                    setNoteText('');
                    setNoteError(null);
                  }}
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />Catatan
                </Button>
                {i.shiftInstanceId && !i.outsideShift && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === i.id}
                    onClick={() => unlinkShift(i)}
                    title="Lepas tautan shift incident berdiri sendiri"
                  >
                    <Link2Off className="h-3.5 w-3.5" />Lepas shift
                  </Button>
                )}
              </>
            ),
          }))}
        />

        <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cabang</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Isi</TableHead>
                <TableHead>Dilaporkan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-ink-muted">
                    Memuat...
                  </TableCell>
                </TableRow>
              )}
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-ink-muted">
                    Tidak ada incident yang cocok
                  </TableCell>
                </TableRow>
              )}
              {visible.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{i.branchName}</TableCell>
                  <TableCell className="text-xs">
                    {i.categoryName || '—'}
                    {i.severity && (
                      <Badge variant="outline" className="ml-1">
                        {i.severity}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <p className="line-clamp-2 text-xs">{i.description}</p>
                    {i.outsideShift && (
                      <Badge variant="secondary" className="mt-1">
                        Di luar shift
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {i.reportedAt.slice(0, 16).replace('T', ' ')}
                    <p className="text-xs text-ink-light">{i.reportedBy || i.reportedByName}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={i.status === 'open' ? 'default' : 'secondary'}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {i.status === 'open' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === i.id}
                          onClick={() => setStatus(i, 'selesai')}
                        >
                          Tandai Selesai
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === i.id}
                          onClick={() => setStatus(i, 'open')}
                        >
                          Buka Kembali
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNoteTarget(i);
                          setNoteText('');
                          setNoteError(null);
                        }}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        Catatan
                      </Button>
                      {i.shiftInstanceId && !i.outsideShift && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === i.id}
                          onClick={() => unlinkShift(i)}
                          title="Lepas tautan shift incident berdiri sendiri"
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                          Lepas
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-ink-light">
          Isi asli incident tidak dapat diubah koreksi dan catatan(admin) ditulis sebagai catatan
          tambahan. Tautan ke shift diatur dari halaman detail incident.
        </p>

        <Dialog
          open={noteTarget !== null}
          onOpenChange={(o) => !o && setNoteTarget(null)}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Tambah catatan admin</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitNote} className="space-y-4">
              {noteError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-error-bg p-3 text-xs font-medium text-error"
                >
                  {noteError}
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="note-text">
                  Catatan <span className="text-error">*</span>
                </Label>
                <Textarea
                  id="note-text"
                  rows={4}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="misal: Sudah ditindaklanjuti manajer area"
                  required
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNoteTarget(null)}
                  disabled={noteLoading}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={noteLoading || noteText.trim().length < 3}>
                  {noteLoading ? 'Menyimpan...' : 'Simpan Catatan'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Petugas view
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Operasional</p>
          <h1 className="mt-1 text-2xl font-bold">Incident</h1>
          <p className="mt-1 text-sm text-ink-muted">Lihat laporan incident dan tindak lanjut cabang Anda.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={refresh} disabled={loading || refreshing} aria-label="Muat ulang incident">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button asChild><Link href="/incident/baru"><Plus className="mr-2 h-4 w-4" />Buat Incident</Link></Button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <label className="block space-y-1 text-sm font-medium">
        Filter cabang
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base">
          <option value="">Semua cabang</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>

      {loading ? (
        <SkeletonIncidentList count={4} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-ink-muted" />
          <h2 className="mt-3 font-semibold">Tidak ada incident</h2>
          <p className="mt-1 text-sm text-ink-muted">Incident baru akan muncul di sini.</p>
          <Button asChild className="mt-4"><Link href="/incident/baru">Buat incident pertama</Link></Button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((incident) => (
            <Link key={incident.id} href={`/incident/${incident.id}`} className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{incident.categoryName}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{incident.branchName}{incident.shiftInstanceId ? ' · Terkait shift' : ' · Di luar shift'}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${incident.status === 'open' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                  {incident.status === 'open' ? 'Terbuka' : 'Selesai'}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{incident.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span>Kejadian: {new Date(incident.occurredAt).toLocaleString('id-ID')}</span>
                <span>Dilaporkan {incident.reportedByName || incident.reportedBy}</span>
                {incident.severity && <span>Tingkat: {incident.severity}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
