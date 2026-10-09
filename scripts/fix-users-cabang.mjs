// scripts/fix-users-cabang.mjs
// Selaraskan kolom Cabang_ID di sheet Users dengan Cabang_ID yang valid di
// Daftar_Cabang (Registry). Mengganti nilai tidak valid (mis. "CBG01BDG, CBG02CMH")
// menjadi cabang aktif yang benar (mis. "CBGBDG01").
//
// DRY-RUN default. Untuk menerapkan:
//   node scripts/fix-users-cabang.mjs apply
//
// Target cabang diambil dari argumen ke-2 (default: cabang aktif pertama).
//   node scripts/fix-users-cabang.mjs apply CBGBDG01

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('apply');
const TARGET_OVERRIDE = process.argv.slice(2).find((a) => !a.startsWith('-') && a !== 'apply');

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
if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) { console.error('Kredensial tidak lengkap'); process.exit(1); }

const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const idxToLetter = (i) => { let n = i + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

async function main() {
  console.log(APPLY ? '=== MODE: APPLY ===' : '=== MODE: DRY-RUN ===');

  // 1. Daftar Cabang_ID valid (aktif)
  const reg = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Daftar_Cabang' });
  const rv = reg.data.values || [];
  const rh = rv[0].map((h) => String(h).trim());
  const cidI = rh.indexOf('Cabang_ID'), aktifI = rh.indexOf('Aktif');
  const validActive = new Set();
  const validAll = new Set();
  for (const row of rv.slice(1)) {
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    const cid = String(row[cidI] ?? '').trim();
    if (!cid) continue;
    validAll.add(cid);
    const a = String(row[aktifI] ?? '').trim().toLowerCase();
    if (a === 'true') validActive.add(cid);
  }
  console.log('Cabang valid (semua):', [...validAll].join(', ') || '(kosong)');
  console.log('Cabang valid (aktif):', [...validActive].join(', ') || '(kosong)');

  const target = TARGET_OVERRIDE || ([...validActive][0] ?? '');
  if (!target) { console.error('Tidak ada cabang aktif sebagai target. Berikan argumen Cabang_ID.'); process.exit(1); }
  console.log('TARGET Cabang_ID baru:', target);

  // 2. Baca Users
  const us = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Users' });
  const uv = us.data.values || [];
  const uh = uv[0].map((h) => String(h).trim());
  const unI = uh.indexOf('Username'), cI = uh.indexOf('Cabang_ID');

  const writes = [];
  let changed = 0, already = 0;
  uv.slice(1).forEach((r, i) => {
    if (r.every((c) => String(c ?? '').trim() === '')) return;
    const rowNum = i + 2;
    const uname = String(r[unI] ?? '').trim();
    const raw = String(r[cI] ?? '');
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    // ID yang tidak ada di Daftar_Cabang (validAll) dianggap tidak valid
    const invalid = ids.filter((id) => !validAll.has(id));
    const hasInvalid = invalid.length > 0;
    if (hasInvalid) {
      changed++;
      console.log('  [' + rowNum + '] ' + uname + ': "' + raw + '"  -> tidak valid: [' + invalid.join(', ') + ']  => jadi "' + target + '"');
      writes.push({ range: 'Users!' + idxToLetter(cI) + rowNum, values: [[target]] });
    } else {
      already++;
      console.log('  [' + rowNum + '] ' + uname + ': "' + raw + '"  (sudah valid, dilewati)');
    }
  });

  console.log('---');
  console.log('Perlu diubah:', changed, '| sudah valid:', already);
  if (changed === 0) { console.log('Tidak ada yang perlu diubah.'); return; }
  if (!APPLY) { console.log('DRY-RUN selesai. Jalankan dengan "apply" untuk menerapkan.'); return; }

  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: registryId, requestBody: { valueInputOption: 'RAW', data: writes } });
  console.log('OK ' + writes.length + ' baris Users.Cabang_ID diperbarui -> ' + target);
}

main().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
