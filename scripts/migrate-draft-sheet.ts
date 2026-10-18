// Menambahkan sheet Drafts ke seluruh spreadsheet cabang.
// Default dry-run; gunakan --apply setelah hasilnya diperiksa.
import { google } from 'googleapis';
import { DRAFT_HEADERS } from '../lib/draft-shift';

const APPLY = process.argv.includes('--apply');
const onlyBranch = process.argv.find((arg) => arg.startsWith('--branch='))?.slice('--branch='.length);

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Kredensial Google belum dikonfigurasi');
  return new google.auth.JWT({ email, key: privateKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
}

function text(value: unknown) { return value === null || value === undefined ? '' : String(value); }

async function main() {
  const authClient = auth();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const drive = google.drive({ version: 'v3', auth: authClient });
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) throw new Error('REGISTRY_SPREADSHEET_ID belum dikonfigurasi');

  const registry = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Daftar_Cabang' });
  const values = registry.data.values ?? [];
  const headers = (values[0] ?? []).map(text);
  const index = (name: string) => headers.indexOf(name);
  const branchIndex = index('Cabang_ID');
  const spreadsheetIndex = index('Spreadsheet_ID');
  const activeIndex = index('Aktif');
  const active = (value: unknown) => ['true', 'TRUE', 'yes', 'YES', '1'].includes(text(value));
  const branches = values.slice(1).map((row) => ({ id: text(row[branchIndex]), spreadsheetId: text(row[spreadsheetIndex]), active: active(row[activeIndex]) }))
    .filter((branch) => branch.id && branch.spreadsheetId && branch.active && (!onlyBranch || branch.id === onlyBranch));

  for (const branch of branches) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: branch.spreadsheetId, fields: 'sheets.properties.title' });
    const exists = (meta.data.sheets ?? []).some((sheet) => sheet.properties?.title === 'Drafts');
    if (exists) {
      console.log(`[SKIP] ${branch.id}: Drafts sudah ada`);
      continue;
    }
    console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] ${branch.id}: buat Drafts`);
    if (!APPLY) continue;
    const backup = await drive.files.copy({ fileId: branch.spreadsheetId, requestBody: { name: `${branch.id} - backup sebelum migrasi Drafts ${new Date().toISOString()}` }, fields: 'id' });
    console.log(`  backup=${backup.data.id}`);
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: branch.spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: 'Drafts' } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: branch.spreadsheetId, range: 'Drafts!A1', valueInputOption: 'RAW', requestBody: { values: [[...DRAFT_HEADERS]] } });
  }
  console.log(`Selesai: ${branches.length} cabang diproses (${APPLY ? 'apply' : 'dry-run'}).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
