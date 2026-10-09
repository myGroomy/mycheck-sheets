// scripts/cleanup-berjalan-shifts.mjs
// Bersihkan data uji: void semua ShiftInstances berstatus 'berjalan' yang
// membuat panel "Peringatan" di dasbor admin menampilkan shift basi.
//
// Aman: DRY-RUN secara default. Untuk benar-benar menulis:
//   node scripts/cleanup-berjalan-shifts.mjs apply
//
// Catatan cache: edit ini menulis LANGSUNG ke Sheets (bukan lewat fungsi tulis
// app), jadi cache in-memory (TTL 15-60s) tidak otomatis di-invalidate. UI segar
// setelah TTL habis / server restart.

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('apply');

function loadEnv() {
  const out = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(__dirname, '..', f);
    try {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
      }
    } catch { /* abaikan */ }
  }
  return out;
}

const env = loadEnv();
const registryId = env.REGISTRY_SPREADSHEET_ID;
if (!registryId) { console.error('REGISTRY_SPREADSHEET_ID tidak ditemukan'); process.exit(1); }
if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
  console.error('Kredensial service account tidak lengkap.'); process.exit(1);
}

const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const COL = { status: 4, void_reason: 15, void_by: 16, void_at: 17, updated_at: 23 };
const idxToLetter = (i) => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

async function main() {
  console.log(APPLY ? '=== MODE: APPLY (akan menulis ke Sheets) ===' : '=== MODE: DRY-RUN (tidak menulis) ===');
  const nowIso = new Date().toISOString();
  const voidReason = 'Bersihkan data uji - shift tidak pernah ditutup (admin cleanup)';

  const reg = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Daftar_Cabang' });
  const rv = reg.data.values || [];
  const rh = rv[0].map((h) => String(h).trim());
  const cidI = rh.indexOf('Cabang_ID'), ssI = rh.indexOf('Spreadsheet_ID'), nmI = rh.indexOf('Nama_Cabang');

  const branches = [];
  for (const row of rv.slice(1)) {
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    const ss = String(row[ssI] ?? '').trim();
    if (!ss) continue;
    branches.push({ id: String(row[cidI] ?? '').trim(), name: String(row[nmI] ?? '').trim(), spreadsheetId: ss });
  }
  console.log('Cabang dengan Spreadsheet_ID:', branches.length);

  let totalBerjalan = 0;
  const writes = [];
  for (const b of branches) {
    let sv;
    try {
      const si = await sheets.spreadsheets.values.get({ spreadsheetId: b.spreadsheetId, range: 'ShiftInstances' });
      sv = si.data.values || [];
    } catch (e) { console.log('  [' + b.id + '] gagal baca ShiftInstances:', e.message); continue; }
    if (!sv.length) { console.log('  [' + b.id + '] "' + b.name + '" - ShiftInstances kosong'); continue; }
    const sh = sv[0].map((h) => String(h).trim());
    const stI = sh.indexOf('status'), idI = sh.indexOf('id'), defI = sh.indexOf('shift_definition_id'), opI = sh.indexOf('opened_at');
    const berjalan = [];
    sv.slice(1).forEach((r, i) => { if (r.every((c) => String(c ?? '').trim() === '')) return; if (String(r[stI] ?? '').trim() === 'berjalan') berjalan.push({ rowNum: i + 2, id: r[idI], def: r[defI], opened: r[opI] }); });
    console.log('  [' + b.id + '] "' + b.name + '" - ' + berjalan.length + " baris status='berjalan'");
    for (const br of berjalan) {
      totalBerjalan++;
      console.log('      baris ' + br.rowNum + ': id=' + br.id + ' def=' + br.def + ' opened=' + br.opened);
      const R = br.rowNum;
      writes.push({ ss: b.spreadsheetId, range: 'ShiftInstances!' + idxToLetter(COL.status) + R, values: [['void']] });
      writes.push({ ss: b.spreadsheetId, range: 'ShiftInstances!' + idxToLetter(COL.void_reason) + R + ':' + idxToLetter(COL.void_at) + R, values: [[voidReason, 'admin', nowIso]] });
      writes.push({ ss: b.spreadsheetId, range: 'ShiftInstances!' + idxToLetter(COL.updated_at) + R, values: [[nowIso]] });
    }
  }

  console.log('---');
  console.log("TOTAL baris 'berjalan' yang akan di-void:", totalBerjalan);
  if (totalBerjalan === 0) { console.log('Tidak ada yang perlu dibersihkan.'); return; }
  if (!APPLY) { console.log('DRY-RUN selesai. Jalankan ulang dengan argumen "apply" untuk menerapkan.'); return; }

  const bySheet = new Map();
  for (const w of writes) { if (!bySheet.has(w.ss)) bySheet.set(w.ss, []); bySheet.get(w.ss).push({ range: w.range, values: w.values }); }
  for (const [ssId, data] of bySheet) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ssId, requestBody: { valueInputOption: 'RAW', data } });
    console.log('  OK ' + data.length + ' range ditulis ke ' + ssId);
  }

  console.log('---');
  console.log('Verifikasi ulang:');
  for (const b of branches) {
    const si = await sheets.spreadsheets.values.get({ spreadsheetId: b.spreadsheetId, range: 'ShiftInstances' });
    const sv = si.data.values || [];
    if (!sv.length) continue;
    const sh = sv[0].map((h) => String(h).trim());
    const stI = sh.indexOf('status');
    const left = sv.slice(1).filter((r) => String(r[stI] ?? '').trim() === 'berjalan').length;
    console.log('  [' + b.id + '] "' + b.name + '" - sisa berjalan:', left);
  }
}

main().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
