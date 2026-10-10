'use client';

// app/admin/operasi-shift/page.tsx ADM-OP-01..05.
// Daftar shift lintas cabang + aksi: tutup paksa, ganti PJ, void, buka atas nama.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Ban as BanIcon, Search, UserCog, UserPlus, XCircle } from 'lucide-react';
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
import {
  SensitiveActionDialog,
  type SensitiveActionValues,
} from '@/components/admin/sensitive-action';
import { apiFetch } from '@/lib/admin/api';

interface ShiftInstance {
  id: string;
  branchId: string;
  branchName: string;
  shiftDefinitionId: string;
  shiftName: string;
  shiftDate: string;
  status: string;
  pjUserId: string;
  openedBy: string;
  openedAt: string;
  closeType: string;
  isTest: boolean;
  isIncomplete: boolean;
  voidReason: string;
  forceCloseReason: string;
}

interface UserLite {
  id: string;
  nama: string;
  role: string;
  cabangId: string;
  isActive: boolean;
}

interface ShiftDefLite {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

type OpAction = 'force_close' | 'change_pj' | 'void';

const ACTION_META: Record<
  OpAction,
  { title: string; confirm: string; icon: typeof Ban; impact: string }
> = {
  force_close: {
    title: 'Tutup paksa shift',
    confirm: 'Tutup paksa',
    icon: XCircle,
    impact:
      'Shift akan ditutup tanpa syarat checklist (BR-30 dilewati). Laporan ditandai "ditutup paksa" dan item yang belum selesai ditandai tidak lengkap. Alasan wajib dicatat di audit log.',
  },
  change_pj: {
    title: 'Ganti PJ shift',
    confirm: 'Ganti PJ',
    icon: UserCog,
    impact:
      'Tanggung jawab shift berpindah ke petugas lain yang punya akses cabang ini. Tercatat dari siapa ke siapa di audit log.',
  },
  void: {
    title: 'Void shift',
    confirm: 'Void',
    icon: Ban,
    impact:
      'Shift dibatalkan. Data tidak dihapus (BR-40) dan tidak dihitung di statistik. Shift yang sudah tertutup tidak bisa di-void koreksinya lewat addendum.',
  },
};

const STATUS_LABEL: Record<string, string> = {
  berjalan: 'Berjalan',
  ditutup: 'Ditutup',
  void: 'Void',
};

export default function OperasiShiftPage() {
  const router = useRouter();
  const [instances, setInstances] = useState<ShiftInstance[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [definitions, setDefinitions] = useState<ShiftDefLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'berjalan' | 'ditutup' | 'void'>('berjalan');
  const [query, setQuery] = useState('');

  // Dialog aksi sensitif
  const [opTarget, setOpTarget] = useState<ShiftInstance | null>(null);
  const [opAction, setOpAction] = useState<OpAction>('force_close');
  const [opLoading, setOpLoading] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [newPjId, setNewPjId] = useState('');

  // Dialog buka atas nama (tanpa PIN)
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  const [obDefinition, setObDefinition] = useState('');
  const [obUser, setObUser] = useState('');
  const [obReason, setObReason] = useState('');
  const [obLoading, setObLoading] = useState(false);
  const [obError, setObError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ instances: ShiftInstance[] }>(
        `/api/admin/shift-instances?status=${statusFilter}`
      );
      setInstances(res.instances);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat shift');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Data pendukung (dipakai dialog ganti PJ & buka atas nama)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, s] = await Promise.all([
          apiFetch<{ users: UserLite[] }>('/api/admin/users'),
          apiFetch<{ shifts: ShiftDefLite[] }>('/api/admin/branches/CBGBDG01/shifts'),
        ]);
        if (cancelled) return;
        setUsers(u.users);
        setDefinitions(s.shifts.filter((d) => d.isActive));
      } catch {
        // Dialog aksi tetap bisa dipakai walau data pendukung gagal dimuat.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openOp = (inst: ShiftInstance, action: OpAction) => {
    setOpTarget(inst);
    setOpAction(action);
    setOpError(null);
    setNewPjId('');
  };

  const submitOp = async (values: SensitiveActionValues) => {
    if (!opTarget) return;
    setOpLoading(true);
    setOpError(null);
    try {
      const res = await apiFetch<{ message: string }>(
        `/api/admin/shift-instances/${opTarget.id}`,
        {
          method: 'PATCH',
          json: {
            action: opAction,
            pin: values.pin,
            reason: values.reason,
            ...(opAction === 'change_pj' ? { newPjUserId: values.extra ?? '' } : {}),
          },
        }
      );
      toast.success(res.message);
      setOpTarget(null);
      await load();
      router.refresh();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : 'Aksi gagal');
    } finally {
      setOpLoading(false);
    }
  };

  const submitOnBehalf = async (e: React.FormEvent) => {
    e.preventDefault();
    setObLoading(true);
    setObError(null);
    try {
      const res = await apiFetch<{ message: string }>(
        '/api/admin/shift-instances/open-on-behalf',
        {
          method: 'POST',
          json: {
            shiftDefinitionId: obDefinition,
            targetUserId: obUser,
            reason: obReason.trim(),
          },
        }
      );
      toast.success(res.message);
      setOnBehalfOpen(false);
      setObDefinition('');
      setObUser('');
      setObReason('');
      await load();
    } catch (err) {
      setObError(err instanceof Error ? err.message : 'Gagal membuka shift');
    } finally {
      setObLoading(false);
    }
  };

  const filtered = instances.filter(
    (i) =>
      i.branchName.toLowerCase().includes(query.toLowerCase()) ||
      i.shiftName.toLowerCase().includes(query.toLowerCase()) ||
      i.id.toLowerCase().includes(query.toLowerCase())
  );

  // Hanya petugas aktif yang punya akses ke cabang target (ADM-OP-03)
  const pjCandidates = users.filter(
    (u) => u.isActive && u.id !== opTarget?.pjUserId
  );

  const meta = ACTION_META[opAction];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 pb-24 md:pb-10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Operasi Shift</h1>
          <p className="text-xs text-ink-muted">
            Shift {STATUS_LABEL[statusFilter].toLowerCase()} lintas cabang
          </p>
        </div>
        <Button onClick={() => setOnBehalfOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Buka Atas Nama
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-44" aria-label="Filter status shift">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="berjalan">Berjalan</SelectItem>
            <SelectItem value="ditutup">Ditutup</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-light"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari shift / cabang"
            className="pl-9"
            aria-label="Cari shift"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cabang</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>PJ</TableHead>
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
                  Tidak ada shift {STATUS_LABEL[statusFilter].toLowerCase()}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((i) => {
              const canOperate = i.status === 'berjalan';
              return (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{i.branchName}</TableCell>
                  <TableCell className="font-medium">
                    {i.shiftName}
                    {i.isTest && (
                      <Badge variant="secondary" className="ml-2">
                        Uji
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{i.shiftDate}</TableCell>
                  <TableCell className="font-mono text-[11px]">{i.pjUserId || '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        i.status === 'berjalan'
                          ? 'default'
                          : i.status === 'void'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {i.closeType === 'paksa' ? 'Ditutup paksa' : STATUS_LABEL[i.status] ?? i.status}
                    </Badge>
                    {i.isIncomplete && (
                      <Badge variant="outline" className="ml-1">
                        Tidak lengkap
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => openOp(i, 'force_close')}
                        title={
                          canOperate
                            ? 'Tutup shift tanpa syarat checklist'
                            : 'Hanya shift berjalan yang bisa ditutup paksa'
                        }
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Tutup Paksa
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => openOp(i, 'change_pj')}
                        title={
                          canOperate
                            ? 'Pindahkan tanggung jawab ke petugas lain'
                            : 'Hanya shift berjalan yang bisa PJ-nya diganti'
                        }
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Ganti PJ
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => openOp(i, 'void')}
                        title={
                          canOperate
                            ? 'Batalkan shift yang dibuka tidak sengaja'
                            : 'Shift yang sudah ditutup dikoreksi lewat addendum'
                        }
                      >
                        <BanIcon className="h-3.5 w-3.5" />
                        Void
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Aksi sensitif: tutup paksa / ganti PJ / void */}
      <SensitiveActionDialog
        open={opTarget !== null}
        onOpenChange={(o) => !o && setOpTarget(null)}
        title={
          opAction === 'change_pj' && opTarget
            ? `${meta.title} ${opTarget.shiftName}`
            : meta.title
        }
        impact={meta.impact}
        confirmLabel={meta.confirm}
        loading={opLoading}
        error={opError}
        extraField={
          opAction === 'change_pj' ? (
            <div className="space-y-1">
              <Label htmlFor="op-pj">Petugas PJ baru</Label>
              <Select value={newPjId} onValueChange={setNewPjId}>
                <SelectTrigger id="op-pj">
                  <SelectValue placeholder="Pilih petugas" />
                </SelectTrigger>
                <SelectContent>
                  {pjCandidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nama} ({u.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-ink-light">
                Hanya petugas aktif yang punya akses ke {opTarget?.branchName}.
              </p>
            </div>
          ) : undefined
        }
        extraValue={newPjId}
        extraValid={opAction !== 'change_pj' || newPjId.length > 0}
        onSubmit={submitOp}
      />

      {/* Buka atas nama alasan wajib, TANPA PIN (ADM-OP-04) */}
      <Dialog open={onBehalfOpen} onOpenChange={setOnBehalfOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buka shift atas nama</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitOnBehalf} className="space-y-4">
            {obError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-error-bg p-3 text-xs font-medium text-error"
              >
                {obError}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="ob-def">
                Shift <span className="text-error">*</span>
              </Label>
              <Select value={obDefinition} onValueChange={setObDefinition}>
                <SelectTrigger id="ob-def">
                  <SelectValue placeholder="Pilih definisi shift" />
                </SelectTrigger>
                <SelectContent>
                  {definitions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.startTime}–{d.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ob-user">
                Petugas <span className="text-error">*</span>
              </Label>
              <Select value={obUser} onValueChange={setObUser}>
                <SelectTrigger id="ob-user">
                  <SelectValue placeholder="Pilih petugas yang jadi PJ" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u.isActive)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nama} ({u.id})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ob-reason">
                Alasan <span className="text-error">*</span>
              </Label>
              <Textarea
                id="ob-reason"
                rows={3}
                value={obReason}
                onChange={(e) => setObReason(e.target.value)}
                placeholder="misal: PJ forget buka shift, sudah 2 jam"
                required
              />
            </div>

            <p className="text-[11px] text-ink-light">
              Aksi ini tidak memerlukan PIN, tetapi tetap tercatat di audit log beserta alasan.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOnBehalfOpen(false)}
                disabled={obLoading}
              >
                Batal
              </Button>
              <Button type="submit" disabled={obLoading || !obDefinition || !obUser}>
                {obLoading ? 'Membuka...' : 'Buka Shift'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}