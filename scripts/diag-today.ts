// scripts/diag-today.ts — cek isi spreadsheet cabang untuk data hari ini.
import { google } from 'googleapis';

const SPREADSHEET_ID = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k';

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[];
  console.log('=== SEMUA TAB ===');
  console.log(titles.join('\n'));

  const month = new Date().toISOString().slice(0, 7);
  console.log(`\n=== BULAN SEKARANG (UTC): ${month} ===`);

  const check = async (range: string) => {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
      const rows = res.data.values || [];
      console.log(`\n--- ${range}: ${Math.max(0, rows.length - 1)} baris data ---`);
      if (rows.length > 0) {
        console.log('HEADERS:', (rows[0] || []).join(' | '));
        rows.slice(1).slice(-5).forEach((r, i) => {
          console.log(`  [${rows.length - 5 + i}] ${r.join(' | ')}`);
        });
      }
      return rows;
    } catch (e) {
      console.log(`\n--- ${range}: ERROR ${(e as Error).message} ---`);
      return [];
    }
  };

  await check('ShiftInstances');
  await check('Reports');
  await check(`Handovers_${month}`);
  await check(`Entries_${month}`);
  await check(`Incidents_${month}`);
  await check('ShiftDefinitions');

  console.log('\n=== TAB bulanan yang ADA di spreadsheet ===');
  console.log(titles.filter((t) => /_\d{4}-\d{2}$/.test(t)).join('\n') || '(tidak ada)');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
