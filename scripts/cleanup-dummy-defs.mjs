// scripts/cleanup-dummy-defs.mjs
// Nonaktifkan definisi shift dummy (nama T1f*) + void instance yg masih terbuka.
// Non-destruktif: TIDAK menghapus baris (riwayat ditutup/void tetap utuh).
// DRY-RUN default. Untuk menerapkan: node scripts/cleanup-dummy-defs.mjs apply
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('apply');
function loadEnv() { const out = {}; for (const f of ['.env', '.env.local']) { const p = path.join(__dirname, '..', f); try { for (const line of fs.readFileSync(p, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) out[m[1]] = m[2].replace(/^"|"$/g, ''); } } catch {} } return out; }
const env = loadEnv();
const registryId = env.REGISTRY_SPREADSHEET_ID;
if (!registryId) { console.error('REGISTRY_SPREADSHEET_ID tidak ditemukan'); process.exit(1); }
const auth = new google.auth.JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const idxToLetter = (i) => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
async function main() {
  console.log(APPLY ? '=== MODE: APPLY ===' : '=== MODE: DRY-RUN ===');
  const nowIso = new Date().toISOString();
  const reg = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Daftar_Cabang' });
  const rv = reg.data.values || [];
  const rh = rv[0].map((h) => String(h).trim());
  const ssI = rh.indexOf('Spreadsheet_ID'), cidI = rh.indexOf('Cabang_ID'), nmI = rh.indexOf('Nama_Cabang');
  const branches = [];
  for (const row of rv.slice(1)) { if (row.every((c) => String(c ?? '').trim() === '')) continue; const ss = String(row[ssI] ?? '').trim(); if (!ss) continue; branches.push({ id: String(row[cidI] ?? '').trim(), name: String(row[nmI] ?? '').trim(), spreadsheetId: ss }); }
  let totalDeact = 0, totalVoid = 0;
  const writes = [];
  for (const b of branches) {
    let dv;
    try { const r = await sheets.spreadsheets.values.get({ spreadsheetId: b.spreadsheetId, range: 'ShiftDefinitions' }); dv = r.data.values || []; } catch (e) { console.log('  [' + b.id + '] gagal baca ShiftDefinitions:', e.message); continue; }
    if (!dv.length) { console.log('  [' + b.id + '] ShiftDefinitions kosong'); continue; }
    const dh = dv[0].map((h) => String(h).trim());
    const idI = dh.indexOf('id'), nmI2 = dh.indexOf('name'), acI = dh.indexOf('is_active');
    const dummy = [];
    dv.slice(1).forEach((r, i) => { if (r.every((c) => String(c ?? '').trim() === '')) return; const nm = String(r[nmI2] ?? ''); if (!/^T1f/i.test(nm)) return; const act = String(r[acI] ?? '').toLowerCase(); dummy.push({ rowNum: i + 2, id: String(r[idI] ?? ''), name: nm, active: act === 'true' }); });
    const needDeact = dummy.filter((d) => d.active);
    console.log('  [' + b.id + '] "' + b.name + '": dummy T1f=' + dummy.length + ', perlu dinonaktifkan=' + needDeact.length);
    needDeact.slice(0, 8).forEach((d) => console.log('      baris ' + d.rowNum + ': ' + d.name));
    if (needDeact.length > 8) console.log('      ... dan ' + (needDeact.length - 8) + ' lagi');
    for (const d of needDeact) { totalDeact++; writes.push({ ss: b.spreadsheetId, range: 'ShiftDefinitions!' + idxToLetter(acI) + d.rowNum, values: [['FALSE']] }); }
  }
  // instance berjalan yang merujuk defs dummy
  console.log('--- cek instance berjalan merujuk defs dummy ---');
  for (const b of branches) {
    let dv, iv;
    try {
      const r1 = await sheets.spreadsheets.values.get({ spreadsheetId: b.spreadsheetId, range: 'ShiftDefinitions' }); dv = r1.data.values || [];
      const r2 = await sheets.spreadsheets.values.get({ spreadsheetId: b.spreadsheetId, range: 'ShiftInstances' }); iv = r2.data.values || [];
    } catch (e) { console.log('  [' + b.id + '] gagal baca:', e.message); continue; }
    if (!dv.length || !iv.length) continue;
    const dh = dv[0].map((h) => String(h).trim());
    const didI = dh.indexOf('id'), dnmI = dh.indexOf('name');
    const dummyIds = new Set();
    dv.slice(1).forEach((r) => { if (r.every((c) => String(c ?? '').trim() === '')) return; if (/^T1f/i.test(String(r[dnmI] ?? ''))) dummyIds.add(String(r[didI] ?? '')); });
    const ih = iv[0].map((h) => String(h).trim());
    const stI = ih.indexOf('status'), sdI = ih.indexOf('shift_definition_id'), iddI = ih.indexOf('id');
    iv.slice(1).forEach((r, i) => { if (r.every((c) => String(c ?? '').trim() === '')) return; if (String(r[stI] ?? '') === 'berjalan' && dummyIds.has(String(r[sdI] ?? ''))) { totalVoid++; console.log('  [' + b.id + '] instance berjalan dummy baris ' + (i + 2) + ' id=' + r[iddI]); const R = i + 2; writes.push({ ss: b.spreadsheetId, range: 'ShiftInstances!E' + R, values: [['void']] }); writes.push({ ss: b.spreadsheetId, range: 'ShiftInstances!P' + R + ':R' + R, values: [['Bersihkan dummy definisi shift uji dihapus', 'admin', nowIso]] }); writes.push({ ss: b.spreadsheetId, range: 'ShiftInstances!X' + R, values: [[nowIso]] }); } });
  }
  console.log('---');
  console.log('Definisi dummy perlu dinonaktifkan:', totalDeact);
  console.log('Instance berjalan dummy perlu di-void:', totalVoid);
  if (totalDeact + totalVoid === 0) { console.log('Tidak ada yang perlu dibersihkan.'); return; }
  if (!APPLY) { console.log('DRY-RUN selesai. Jalankan dengan "apply".'); return; }
  const bySheet = new Map();
  for (const w of writes) { if (!bySheet.has(w.ss)) bySheet.set(w.ss, []); bySheet.get(w.ss).push({ range: w.range, values: w.values }); }
  for (const [ssId, data] of bySheet) { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ssId, requestBody: { valueInputOption: 'RAW', data } }); console.log('  OK ' + data.length + ' range ditulis ke ' + ssId); }
  console.log('Selesai.');
}
main().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
