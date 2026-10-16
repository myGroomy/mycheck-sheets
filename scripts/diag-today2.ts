// scripts/diag-today2.ts — detail baris hari ini (semua kolom).
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
  const get = async (range: string) => {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    return res.data.values || [];
  };

  const inst = await get('ShiftInstances');
  const ih = inst[0];
  console.log('=== ShiftInstances headers ===');
  console.log(ih.map((h, i) => `${i}:${h}`).join('  '));
  const pick = (r: string[]) => {
    const o: Record<string, string> = {};
    ih.forEach((h, i) => (o[h] = r[i] ?? ''));
    return o;
  };
  console.log('\n=== ShiftInstances rows WHERE shift_date contains 2026-10-16 ===');
  inst.slice(1).filter((r) => (r[2] || '').includes('2026-10-16')).forEach((r) => {
    const o = pick(r);
    console.log(JSON.stringify({ id: o.id, def: o.shift_definition_id, date: o.shift_date, tab: o.tab_month, status: o.status, pj: o.pj_user_id, is_test: o.is_test, opened_at: o.opened_at, closed_at: o.closed_at, void_reason: o.void_reason }));
  });

  console.log('\n=== 8 baris TERAKHIR ShiftInstances (by index) ===');
  inst.slice(1).slice(-8).forEach((r) => {
    const o = pick(r);
    console.log(JSON.stringify({ id: o.id, def: o.shift_definition_id, date: o.shift_date, tab: o.tab_month, status: o.status, is_test: o.is_test }));
  });

  const rep = await get('Reports');
  console.log('\n=== Reports headers ===');
  console.log(rep[0].map((h, i) => `${i}:${h}`).join('  '));
  console.log('=== Reports rows WHERE generated/date contains 2026-10-16 ===');
  rep.slice(1).filter((r) => r.some((c) => (c || '').includes('2026-10-16'))).forEach((r) => {
    console.log(JSON.stringify(r));
  });
  console.log(`total Reports rows: ${rep.length - 1}`);

  const hv = await get('Handovers_2026-10');
  console.log('\n=== Handovers_2026-10 ===');
  console.log('headers:', hv[0].join(' | '));
  hv.slice(1).forEach((r, i) => console.log(`[${i}] ${JSON.stringify(r)}`));
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
