// scripts/diag-future.ts — berapa banyak shift bertanggal masa depan & bulan apa.
import { google } from 'googleapis';

const SPREADSHEET_ID = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k';
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function get(range: string) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  return r.data.values || [];
}

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const t = today.toISOString().slice(0, 10);
  console.log('today (UTC) =', t);

  const inst = await get('ShiftInstances');
  const h = inst[0];
  const idx = (n: string) => h.indexOf(n);
  const rows = inst.slice(1);
  const future = rows.filter((r) => (r[idx('shift_date')] || '') > t);
  const past = rows.filter((r) => (r[idx('shift_date')] || '') <= t);
  console.log(`total instances: ${rows.length}, future: ${future.length}, <=today: ${past.length}`);

  const byMonth: Record<string, number> = {};
  future.forEach((r) => { const m = r[idx('tab_month')] || '?'; byMonth[m] = (byMonth[m] || 0) + 1; });
  console.log('future by tab_month:', byMonth);

  console.log('\nsample future rows (shift_date, created_at, closed_at, is_test, void_reason, def):');
  future.slice(0, 6).forEach((r) => console.log(' ', JSON.stringify({
    id: r[idx('id')], date: r[idx('shift_date')], created: r[idx('created_at')], closed: r[idx('closed_at')], is_test: r[idx('is_test')], void: r[idx('void_reason')], def: r[idx('shift_definition_id')],
  })));

  // Reports: tanggal unik
  const rep = await get('Reports');
  const rh = rep[0];
  const ri = (n: string) => rh.indexOf(n);
  const byId = new Map(rows.map((r) => [r[idx('id')], r]));
  const dateCount: Record<string, number> = {};
  rep.slice(1).forEach((r) => {
    const i = byId.get(r[ri('shift_instance_id')]);
    const d = i ? (i[idx('shift_date')] || '?') : '(no instance)';
    dateCount[d.slice(0, 7)] = (dateCount[d.slice(0, 7)] || 0) + 1;
  });
  console.log('\nreports by shift_date month:', dateCount);

  // Tab bulanan
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties.title' });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[];
  console.log('\nmonthly tabs:', titles.filter((x) => /_\d{4}-\d{2}$/.test(x)).join(', '));
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
