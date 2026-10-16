// scripts/diag-registry.ts — cek Daftar_Cabang mentah.
import { google } from 'googleapis';

const REG = process.env.REGISTRY_SPREADSHEET_ID!;

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function main() {
  console.log('REGISTRY_SPREADSHEET_ID =', REG);
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: REG, range: 'Daftar_Cabang' });
  const rows = res.data.values || [];
  console.log('headers:', JSON.stringify(rows[0]));
  rows.slice(1).forEach((r, i) => {
    console.log(`\nrow ${i + 2}:`, JSON.stringify(r));
    const o: Record<string, string> = {};
    (rows[0] || []).forEach((h, ci) => (o[h] = r[ci] ?? ''));
    console.log('  parsed:', JSON.stringify({
      Cabang_ID: o.Cabang_ID,
      Kode: o.Kode,
      Aktif: o.Aktif,
      Aktif_typeof_js: typeof o.Aktif,
      Spreadsheet_ID: o.Spreadsheet_ID,
      Folder_Drive_ID: o.Folder_Drive_ID,
      Branch_Folder_ID: o.Branch_Folder_ID,
      Evidence_Folder_ID: o.Evidence_Folder_ID,
    }));
    const v: unknown = o.Aktif;
    console.log('  isAktif(accepts true/true/TRUE/True)?', v === 'true' || v === 'TRUE' || v === 'True');
  });
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
