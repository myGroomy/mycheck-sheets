'use client';

// app/admin/incident/page.tsx — ADM-IN-01..04.
// Tabel incident lintas cabang + filter kategori/status/cabang/tanggal,
// ubah status, tambah catatan admin, dan tautkan ke shift.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link2Off, MessageSquarePlus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { apiFetch } from '@/lib/admin/api';

interface IncidentRow {
  id: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryName: string;
  description: string;
  occurredAt: string;
  reportedAt: string;
  reportedBy: string;
  status: string;
  severity: string | null;
  outsideShift: boolean;
  shiftInstanceId: string | null;
}

interface IncidentCategory {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  selesai: 'Selesai',
};

export default function IncidentAdminPage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [categories, setCategories] = useState<IncidentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'semua' | 'open' | 'selesai'>('semua');
  const [categoryFilter, setCategoryFilter] = useState('semua');
  const [branchFilter, setBranchFilter] = useState('semua');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dialog catatan admin
  const [noteTarget, setNoteTarget] = useState<IncidentRow | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ incidents: IncidentRow[] }>('/api/incidents');
      setIncidents(res.incidents);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat incident');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiFetch<{ categories: IncidentCategory[] }>('/api/admin/incident-categories')
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  const setStatus = async (incident: IncidentRow, status: 'open' | 'selesai') => {
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

  const unlinkShift = async (incident: IncidentRow) => {
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

  const filtered = incidents.filter((i) => {
    if (statusFilter !== 'semua' && i.status !== statusFilter) return false;
    if (categoryFilter !== 'semua' && i.categoryId !== categoryFilter) return false;
    if (branchFilter !== 'semua' && i.branchId !== branchFilter) return false;
    if (dateFrom && i.reportedAt.slice(0, 10) < dateFrom) return false;
    if (dateTo && i.reportedAt.slice(0, 10) > dateTo) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = `${i.description} ${i.categoryName} ${i.branchName} ${i.reportedBy}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const openCount = filtered.filter((i) => i.status === 'open').length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Incident</h1>
        <p className="text-xs text-ink-muted">
          Daftar incident lintas cabang — {openCount} masih open dari {filtered.length} tampil
        </p>
      </div>

      {/* Filter (ADM-IN-01) */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
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
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-ink-muted">
                  Tidak ada incident yang cocok
                </TableCell>
              </TableRow>
            )}
            {filtered.map((i) => (
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
                  <p className="text-[11px] text-ink-light">{i.reportedBy}</p>
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
                        title="Lepas tautan shift — incident berdiri sendiri"
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

      {/* Isi asli incident tidak dapat diedit (BR-41); koreksi lewat catatan. */}
      <p className="text-[11px] text-ink-light">
        Isi asli incident tidak dapat diubah — koreksi dan catatan(admin) ditulis sebagai catatan
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