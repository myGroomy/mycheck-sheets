// scripts/migrate-fase-d.ts
// Fase D: Migrasi cabang CBGBDG01 ke struktur folder v2.
//
// Langkah:
//   0. Backup: baca Registry Daftar_Cabang, catat state saat ini
//   1. Verifikasi folder CBGBDG01 (harus sudah ada, boleh punya subfolder tapi 0 file langsung)
//   2. Buat subfolder Evidence (idempotent)
//   3. Pindahkan spreadsheet ke dalam branch folder (idempotent — cek parent)
//   4. Set description mycheck_branch=CBGBDG01 pada folder & spreadsheet
//   5. Update Registry: Branch_Folder_ID + Evidence_Folder_ID
//   6. Verifikasi: GAS createBranchStructure harus reused=true
//
// Usage:
//   npx tsx --env-file=.env scripts/migrate-fase-d.ts
//   npx tsx --env-file=.env scripts/migrate-fase-d.ts --dry-run

import { google, drive_v3 } from 'googleapis';

// Known IDs dari context
const BRANCH_FOLDER_ID = '1Bx6l_-K2qC0L7quq9K7iCIO-ord7sUBk'; // MyCheck - CBGBDG01
const SPREADSHEET_ID = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k'; // CBGBDG01 - Bandung
const CABANG_ID = 'CBGBDG01';
const CABANG_KODE = 'CBGBDG01';

const DRY_RUN = process.argv.includes('--dry-run');

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

async function main() {
  if (DRY_RUN) console.log('=== DRY RUN — tidak ada perubahan ===\n');

  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });
  const registryId = process.env.REGISTRY_SPREADSHEET_ID!;

  // ── Step 0: Backup — baca state saat ini ──
  console.log('Step 0: Baca state Registry saat ini...');
  const regRes = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: 'Daftar_Cabang',
  });
  const regRows = regRes.data.values || [];
  const headers = regRows[0] || [];
  const cabangIdx = headers.indexOf('Cabang_ID');
  const row = regRows.find((r, i) => i > 0 && String(r[cabangIdx] ?? '') === CABANG_ID);
  if (!row) {
    console.error(`FATAL: ${CABANG_ID} tidak ditemukan di Registry.`);
    process.exit(1);
  }
  const rowNum = regRows.indexOf(row) + 1; // 1-based sheet row

  console.log('  Registry row:', rowNum);
  console.log('  Current values:');
  headers.forEach((h, i) => console.log(`    ${h}: ${row[i] ?? '(kosong)'}`));

  let branchFolderCol = headers.indexOf('Branch_Folder_ID');
  let evidenceFolderCol = headers.indexOf('Evidence_Folder_ID');

  // Auto-add missing columns at end of header row
  if (branchFolderCol < 0 || evidenceFolderCol < 0) {
    const toAdd: string[] = [];
    if (branchFolderCol < 0) toAdd.push('Branch_Folder_ID');
    if (evidenceFolderCol < 0) toAdd.push('Evidence_Folder_ID');
    console.log(`  Kolom belum ada di Registry: ${toAdd.join(', ')}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Akan menambahkan header: ${toAdd.join(', ')} di kolom ${columnLetter(headers.length)}+`);
      // Assign placeholder indices for dry-run
      if (branchFolderCol < 0) { branchFolderCol = headers.length; headers.push('Branch_Folder_ID'); }
      if (evidenceFolderCol < 0) { evidenceFolderCol = headers.length; headers.push('Evidence_Folder_ID'); }
    } else {
      const startCol = columnLetter(headers.length);
      const endCol = columnLetter(headers.length + toAdd.length - 1);
      await sheets.spreadsheets.values.update({
        spreadsheetId: registryId,
        range: `Daftar_Cabang!${startCol}1:${endCol}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [toAdd] },
      });
      console.log(`  Header ditambahkan: ${toAdd.join(', ')}`);
      // Update local indices
      if (branchFolderCol < 0) { branchFolderCol = headers.length; headers.push('Branch_Folder_ID'); }
      if (evidenceFolderCol < 0) { evidenceFolderCol = headers.length; headers.push('Evidence_Folder_ID'); }
    }
  }

  // ── Step 1: Verifikasi folder ──
  console.log('\nStep 1: Verifikasi folder branch...');
  const folderMeta = await drive.files.get({
    fileId: BRANCH_FOLDER_ID,
    fields: 'id,name,mimeType,description',
  });
  console.log(`  Folder: ${folderMeta.data.name} (${folderMeta.data.id})`);
  if (folderMeta.data.mimeType !== 'application/vnd.google-apps.folder') {
    console.error('FATAL: ID bukan folder.');
    process.exit(1);
  }

  // Cek file langsung di folder (bukan subfolder)
  const filesInFolder = await drive.files.list({
    q: `'${BRANCH_FOLDER_ID}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name,mimeType)',
    pageSize: 10,
  });
  const directFiles = filesInFolder.data.files || [];
  // Spreadsheet yang akan dipindahkan ke sini boleh sudah ada
  const nonSpreadsheetFiles = directFiles.filter(f => f.id !== SPREADSHEET_ID);
  if (nonSpreadsheetFiles.length > 0) {
    console.log('  File non-spreadsheet ditemukan di folder:');
    nonSpreadsheetFiles.forEach(f => console.log(`    - ${f.name} (${f.id})`));
    // Ini bukan blocker fatal kalau cuma spreadsheet target
    if (directFiles.some(f => f.id === SPREADSHEET_ID)) {
      console.log('  Spreadsheet sudah di dalam folder. Non-spreadsheet files di atas perlu diperiksa manual.');
    } else {
      console.error('FATAL: Folder memiliki file selain spreadsheet target. Periksa manual.');
      process.exit(1);
    }
  }

  // ── Step 2: Buat subfolder Evidence (idempotent) ──
  console.log('\nStep 2: Buat/cari subfolder Evidence...');
  const evSearch = await drive.files.list({
    q: `'${BRANCH_FOLDER_ID}' in parents and name = 'Evidence' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
  });
  let evidenceFolderId: string;
  if (evSearch.data.files && evSearch.data.files.length > 0) {
    evidenceFolderId = evSearch.data.files[0].id!;
    console.log(`  Evidence folder sudah ada: ${evidenceFolderId}`);
  } else if (DRY_RUN) {
    evidenceFolderId = '(dry-run-would-create)';
    console.log('  [DRY RUN] Akan membuat subfolder Evidence.');
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: 'Evidence',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [BRANCH_FOLDER_ID],
      },
      fields: 'id',
    });
    evidenceFolderId = created.data.id!;
    console.log(`  Evidence folder dibuat: ${evidenceFolderId}`);
  }

  // ── Step 3: Pindahkan spreadsheet ke branch folder (idempotent) ──
  console.log('\nStep 3: Pindahkan spreadsheet ke branch folder...');
  const ssMeta = await drive.files.get({
    fileId: SPREADSHEET_ID,
    fields: 'id,name,parents',
  });
  const currentParents = ssMeta.data.parents || [];
  console.log(`  Spreadsheet: ${ssMeta.data.name}`);
  console.log(`  Current parents: ${currentParents.join(', ')}`);

  if (currentParents.includes(BRANCH_FOLDER_ID)) {
    console.log('  Spreadsheet sudah di dalam branch folder. Skip.');
  } else if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan pindahkan dari ${currentParents.join(',')} → ${BRANCH_FOLDER_ID}`);
  } else {
    await drive.files.update({
      fileId: SPREADSHEET_ID,
      addParents: BRANCH_FOLDER_ID,
      removeParents: currentParents.join(','),
      fields: 'id,parents',
    });
    console.log(`  Spreadsheet dipindahkan ke ${BRANCH_FOLDER_ID}`);
  }

  // ── Step 4: Set description mycheck_branch=CBGBDG01 ──
  console.log('\nStep 4: Set description...');
  const desc = `mycheck_branch=${CABANG_KODE}`;

  for (const [label, fileId] of [['Folder', BRANCH_FOLDER_ID], ['Spreadsheet', SPREADSHEET_ID]] as const) {
    const meta = await drive.files.get({ fileId, fields: 'description' });
    if (meta.data.description === desc) {
      console.log(`  ${label}: description sudah benar.`);
    } else if (DRY_RUN) {
      console.log(`  [DRY RUN] ${label}: akan set description "${desc}" (sekarang: "${meta.data.description ?? ''}")`);
    } else {
      await drive.files.update({
        fileId,
        requestBody: { description: desc },
        fields: 'id',
      });
      console.log(`  ${label}: description diset "${desc}"`);
    }
  }

  // ── Step 5: Update Registry ──
  console.log('\nStep 5: Update Registry...');
  const currentBranch = String(row[branchFolderCol] ?? '');
  const currentEvidence = String(row[evidenceFolderCol] ?? '');

  if (currentBranch === BRANCH_FOLDER_ID && currentEvidence === evidenceFolderId) {
    console.log('  Registry sudah terisi. Skip.');
  } else if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan update row ${rowNum}:`);
    console.log(`    Branch_Folder_ID: "${currentBranch}" → "${BRANCH_FOLDER_ID}"`);
    console.log(`    Evidence_Folder_ID: "${currentEvidence}" → "${evidenceFolderId}"`);
  } else {
    const colB = columnLetter(branchFolderCol);
    const colE = columnLetter(evidenceFolderCol);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: registryId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `Daftar_Cabang!${colB}${rowNum}`, values: [[BRANCH_FOLDER_ID]] },
          { range: `Daftar_Cabang!${colE}${rowNum}`, values: [[evidenceFolderId]] },
        ],
      },
    });
    console.log(`  Registry updated: Branch_Folder_ID=${BRANCH_FOLDER_ID}, Evidence_Folder_ID=${evidenceFolderId}`);
  }

  // ── Step 6: Verifikasi GAS createBranchStructure ──
  console.log('\nStep 6: Verifikasi GAS createBranchStructure...');
  const gasUrl = process.env.MYCHECK_GAS_URL;
  const gasKey = process.env.MYCHECK_GAS_ADMIN_KEY;

  if (!gasUrl || !gasKey) {
    console.log('  SKIP: MYCHECK_GAS_URL atau MYCHECK_GAS_ADMIN_KEY belum diset.');
  } else if (DRY_RUN) {
    console.log('  [DRY RUN] Akan panggil createBranchStructure dan cek reused=true.');
  } else {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'createBranchStructure',
        'x-api-key': gasKey,
        payload: { branchCode: CABANG_KODE, branchName: 'Bandung' },
      }),
    });
    const text = await res.text();
    let parsed: { success?: boolean; data?: { reused?: boolean; branchFolderId?: string; evidenceFolderId?: string } };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('  FATAL: Respons GAS bukan JSON:', text.slice(0, 200));
      process.exit(1);
    }

    if (!parsed.success) {
      console.error('  FATAL: GAS gagal:', text.slice(0, 300));
      process.exit(1);
    }

    const d = parsed.data!;
    console.log(`  reused: ${d.reused}`);
    console.log(`  branchFolderId: ${d.branchFolderId}`);
    console.log(`  evidenceFolderId: ${d.evidenceFolderId}`);

    if (!d.reused) {
      console.error('  WARNING: GAS tidak mendeteksi folder existing! Periksa description property.');
    }
    if (d.branchFolderId !== BRANCH_FOLDER_ID) {
      console.error(`  WARNING: Branch folder ID mismatch! Expected ${BRANCH_FOLDER_ID}, got ${d.branchFolderId}`);
    }
    if (d.evidenceFolderId !== evidenceFolderId) {
      console.error(`  WARNING: Evidence folder ID mismatch! Expected ${evidenceFolderId}, got ${d.evidenceFolderId}`);
    }

    if (d.reused && d.branchFolderId === BRANCH_FOLDER_ID && d.evidenceFolderId === evidenceFolderId) {
      console.log('  ✓ GAS idempotency verified.');
    }
  }

  // ── Step 7: Fase 0 sudah selesai (skip) ──
  console.log('\nStep 7: Fase 0 (revoke public write) sudah selesai sebelumnya. Skip.');

  console.log('\n' + (DRY_RUN ? '=== DRY RUN selesai ===' : '=== Fase D selesai ==='));
}

function columnLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
