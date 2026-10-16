// scripts/revoke-public-write.ts
// Fase 0: cabut izin `anyone` pada ROOT dan folder cabang.
//
// Service account tidak dapat melakukan ini sendiri (Drive API menolak
// permissions.delete untuk permission yang diwarisi). Script ini memanggil
// action GAS `revokePublicWrite`, yang berjalan sebagai owner.
//
// Pakai:
//   npm run revoke:public-write                    # semua target dari Registry
//   npm run revoke:public-write -- --dry-run       # hanya laporan, tanpa perubahan
//   npm run revoke:public-write -- --folder <ID>   # satu folder saja
//
// Script ini hanya membaca. Bila GAS belum di-deploy atau mengembalikan error,
// tidak ada perubahan pada Drive.

import { getDriveClient } from '../lib/google/client';
import { getCabangList } from '../lib/google/registry-admin';
import { isGasConfigured } from '../lib/google/gas-client';
import {
  revokePublicWriteViaGas,
  isFullyRevoked,
} from '../lib/google/drive-permission-gas';

interface PermissionSnapshot {
  folderId: string;
  folderName: string;
  publicPermissions: Array<{ role: string; id: string }>;
}

/** Baca permission publik via service account (hanya bisa membaca). */
async function snapshot(folderId: string, label: string): Promise<PermissionSnapshot | null> {
  const drive = getDriveClient();
  try {
    const r = await drive.permissions.list({
      fileId: folderId,
      supportsAllDrives: true,
      fields: 'permissions(id,type,role)',
    });
    const anyone = (r.data.permissions ?? [])
      .filter((p) => p.type === 'anyone')
      .map((p) => ({ role: String(p.role), id: String(p.id) }));
    let folderName = label;
    try {
      const f = await drive.files.get({
        fileId: folderId,
        supportsAllDrives: true,
        fields: 'name',
      });
      folderName = String(f.data.name ?? label);
    } catch {
      /* nama tidak wajib */
    }
    return { folderId, folderName, publicPermissions: anyone };
  } catch (e) {
    console.log(`  ! tidak bisa membaca permission [${folderId}]: ${(e as Error).message.slice(0, 100)}`);
    return null;
  }
}

function printSnapshot(s: PermissionSnapshot): void {
  console.log(`\n  ${s.folderName}  [${s.folderId}]`);
  if (s.publicPermissions.length === 0) {
    console.log('    tidak ada akses publik');
  } else {
    for (const p of s.publicPermissions) {
      console.log(`    anybody: ${p.role}  (permissionId=${p.id})`);
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const explicitFolder = (() => {
    const i = argv.indexOf('--folder');
    return i >= 0 ? argv[i + 1] : undefined;
  })();

  // Kumpulkan target: folder root + folder cabang dari Registry.
  const targets: Array<{ id: string; label: string }> = [];
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';
  if (rootFolderId) targets.push({ id: rootFolderId, label: 'ROOT' });

  if (explicitFolder) {
    targets.length = 0;
    targets.push({ id: explicitFolder, label: 'FOLDER' });
  } else {
    try {
      const branches = await getCabangList();
      for (const b of branches) {
        const folderId = b.Branch_Folder_ID || b.Folder_Drive_ID;
        if (!folderId) continue;
        if (folderId === rootFolderId) continue; // sudah masuk daftar
        targets.push({ id: folderId, label: `${b.Cabang_ID} branch folder` });
      }
    } catch (e) {
      console.error('Gagal membaca Registry:', (e as Error).message);
      process.exit(1);
    }
  }

  if (targets.length === 0) {
    console.log('Tidak ada target folder yang ditemukan.');
    console.log('Isi GOOGLE_DRIVE_FOLDER_ID, atau Folder_Drive_ID / Branch_Folder_ID di Registry.');
    return;
  }

  console.log('== SEBELUM ==');
  const before: PermissionSnapshot[] = [];
  for (const t of targets) {
    const snap = await snapshot(t.id, t.label);
    if (snap) {
      before.push(snap);
      printSnapshot(snap);
    }
  }

  const totalBefore = before.reduce((n, s) => n + s.publicPermissions.length, 0);
  console.log(`\nTotal permission publik sebelum: ${totalBefore}`);

  if (totalBefore === 0) {
    console.log('\nTidak ada akses publik. Fase 0 tidak perlu dijalankan.');
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: tidak memanggil GAS, tidak ada perubahan.');
    return;
  }

  if (!isGasConfigured('admin')) {
    console.error('\nGAS belum dikonfigurasi (MYCHECK_GAS_URL / MYCHECK_GAS_ADMIN_KEY).');
    console.error('Fase 0 tidak bisa dijalankan dari sini.');
    console.error('Alternatif manual: buka Drive > Bagikan > Hapus "Anyone with the link".');
    process.exit(1);
  }

  console.log('\n== MEMANGGIL GAS revokePublicWrite ==');
  let output;
  try {
    output = await revokePublicWriteViaGas(targets.map((t) => t.id));
  } catch (e) {
    console.error('  GAS gagal:', (e as Error).message);
    process.exit(1);
  }

  for (const r of output.results) {
    const label = r.name ?? r.folderId;
    if (r.error) {
      console.log(`  ${label}: GAGAL - ${r.error}`);
    } else {
      console.log(`  ${label}: dicabut ${r.revoked ?? 0}, tersisa ${r.remainingPublic ?? 0}`);
      if (r.failed && r.failed.length > 0) {
        for (const f of r.failed) console.log(`    ⚠ gagal: ${f}`);
      }
    }
  }

  // Verifikasi independen: baca ulang lewat service account, jangan percaya GAS.
  console.log('\n== SESUDAH (verifikasi ulang via service account) ==');
  const after: PermissionSnapshot[] = [];
  for (const t of targets) {
    const snap = await snapshot(t.id, t.label);
    if (snap) {
      after.push(snap);
      printSnapshot(snap);
    }
  }
  const totalAfter = after.reduce((n, s) => n + s.publicPermissions.length, 0);
  console.log(`\nTotal permission publik sesudah: ${totalAfter}`);

  if (totalAfter === 0 && isFullyRevoked(output)) {
    console.log('\nFase 0 SELESAI: tidak ada akses tulis publik yang tersisa.');
    return;
  }

  console.log('\nFase 0 BELUM SELESAI: masih ada akses publik atau ada target yang gagal.');
  process.exit(1);
}

void main();
