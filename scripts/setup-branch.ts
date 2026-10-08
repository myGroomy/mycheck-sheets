// scripts/setup-branch.ts
// Daftarkan spreadsheet cabang (hasil copy manual dari Template_cabang_mycheck)
// ke sheet Daftar_Cabang di Registry, sekaligus memverifikasi strukturnya.
//
// Workflow: user copy manual template di Google Drive -> rename MYCHECK_<ID>
// -> share ke service account sebagai Editor -> jalankan script ini.
//
// Usage: npx tsx --env-file=.env scripts/setup-branch.ts <Cabang_ID> <Nama_Cabang> <Spreadsheet_ID> [Timezone] [Kode]
import { google } from 'googleapis';
import { STATIC_SHEETS, MONTHLY_SHEETS } from '../lib/google/branch-schema';

const [cabangId, namaCabang, spreadsheetId, timezone = 'Asia/Jakarta', kode = ''] = process.argv.slice(2);
if (!cabangId || !namaCabang || !spreadsheetId) {
  console.error(
    'Usage: npx tsx --env-file=.env scripts/setup-branch.ts <Cabang_ID> <Nama_Cabang> <Spreadsheet_ID> [Timezone] [Kode]'
  );
  process.exit(1);
}

const REGISTRY_ID = process.env.REGISTRY_SPREADSHEET_ID!;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  });
}

const CURRENT_TAB = new Date().toISOString().slice(0, 7); // YYYY-MM

async function main() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Verifikasi sheet statis wajib ada
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties?.title));

  const missingStatic = Object.keys(STATIC_SHEETS).filter((t) => !existing.has(t));
  if (missingStatic.length > 0) {
    console.warn('WARN: sheet statis belum ada:', missingStatic.join(', '));
  }

  // 2. Pastikan tab bulanan bulan ini ada (dipakai otomatis saat shift dibuka)
  const requests: object[] = [];
  for (const base of Object.keys(MONTHLY_SHEETS)) {
    const title = `${base}_${CURRENT_TAB}`;
    if (!existing.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    for (const base of Object.keys(MONTHLY_SHEETS)) {
      const title = `${base}_${CURRENT_TAB}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [MONTHLY_SHEETS[base]] },
      });
    }
    console.log(`Tab bulanan ${CURRENT_TAB} dibuat:`, Object.keys(MONTHLY_SHEETS).length);
  }

  // 3. Pastikan _meta punya default
  const metaRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: '_meta!A:B' });
  const metaVals = metaRes.data.values || [];
  const have = new Set(metaVals.slice(1).map((r) => String(r[0] ?? '')));
  const toAdd: string[][] = [];
  if (!have.has('tolerance_default_minutes')) toAdd.push(['tolerance_default_minutes', '15']);
  if (!have.has('version')) toAdd.push(['version', '1']);
  if (toAdd.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: '_meta',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: toAdd },
    });
  }

  // 4. Daftar cabang ke Registry (Daftar_Cabang)
  const regSheets = await sheets.spreadsheets.values.get({
    spreadsheetId: REGISTRY_ID,
    range: 'Daftar_Cabang!A:G',
  });
  const regRows = regSheets.data.values || [];
  const already = regRows.slice(1).find((r) => String(r[0] ?? '') === cabangId);
  if (!already) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: REGISTRY_ID,
      range: 'Daftar_Cabang',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[cabangId, namaCabang, kode || cabangId, timezone, spreadsheetId, FOLDER_ID, 'TRUE']],
      },
    });
    console.log('Registered branch in Daftar_Cabang:', cabangId);
  } else {
    const current = String(already[4] ?? '');
    if (current !== spreadsheetId) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: REGISTRY_ID,
        range: `Daftar_Cabang!E${regRows.indexOf(already) + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[spreadsheetId]] },
      });
      console.log(`Updated Spreadsheet_ID for ${cabangId}: ${current} -> ${spreadsheetId}`);
    } else {
      console.log('Branch already registered:', cabangId);
    }
  }

  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});