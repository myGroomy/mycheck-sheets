// Migrasi data cabang dari sheet bulanan ke sheet tahunan.
//
// Default adalah dry-run. Jalankan --apply --branch CBGBDG01 setelah laporan
// dry-run diperiksa. Script tidak menghapus sheet bulanan dan dapat diulang.

import { google } from 'googleapis';
import { MONTHLY_SHEETS, STATIC_SHEETS, YEARLY_SHEETS, periodSheetName } from '../lib/schema/registry';
import { normalizeWrite } from '../lib/schema/normalize';

const APPLY = process.argv.includes('--apply');
const branchArg = process.argv.find((arg) => arg.startsWith('--branch='))?.slice('--branch='.length);
const onlyBranch = branchArg || (process.argv.includes('--branch') ? process.argv[process.argv.indexOf('--branch') + 1] : undefined);

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Kredensial Google belum dikonfigurasi');
  return new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  });
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function objects(headers: string[], rows: unknown[][]): Record<string, unknown>[] {
  return rows.filter((row) => row.some((value) => asText(value).trim() !== '')).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

async function readSheet(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string) {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: title });
    const values = response.data.values ?? [];
    return { headers: (values[0] ?? []).map(String), rows: objects((values[0] ?? []).map(String), values.slice(1)) };
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 400 || code === 404) return { headers: [], rows: [] };
    throw error;
  }
}

async function sheetTitles(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<string[]> {
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (response.data.sheets ?? []).map((sheet) => String(sheet.properties?.title ?? '')).filter(Boolean);
}

async function ensureSheet(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string, headers: string[], apply: boolean) {
  const titles = await sheetTitles(sheets, spreadsheetId);
  if (titles.includes(title)) {
    const current = await readSheet(sheets, spreadsheetId, title);
    const matches = current.headers.length === headers.length && current.headers.every((header, index) => header === headers[index]);
    if (!matches && apply) {
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${title}!A1`, valueInputOption: 'RAW', requestBody: { values: [headers] } });
    }
    return;
  }
  if (!apply) return;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${title}!A1`, valueInputOption: 'RAW', requestBody: { values: [headers] } });
}

async function appendRows(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string, rows: unknown[][]) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({ spreadsheetId, range: title, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: rows } });
}

function columnLetter(index: number): string {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

async function ensureStaticColumns(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string, requiredHeaders: string[], apply: boolean) {
  const current = await readSheet(sheets, spreadsheetId, title);
  if (current.headers.length === 0) return;
  const missing = requiredHeaders.filter((header) => !current.headers.includes(header));
  if (missing.length === 0) return;
  console.log(`  ${title}: kolom baru ${missing.join(', ')}`);
  if (!apply) return;
  const start = current.headers.length;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!${columnLetter(start)}1:${columnLetter(start + missing.length - 1)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [missing] },
  });
  if (current.rows.length) {
    const values = current.rows.map((row) => missing.map((header) => {
      if (title === 'ShiftInstances' && header === 'tab_year') return asText(row.shift_date).slice(0, 4);
      return header === 'points' || header === 'points_snapshot' ? '0' : '';
    }));
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!${columnLetter(start)}2:${columnLetter(start + missing.length - 1)}${current.rows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
}

async function updateMeta(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const current = await readSheet(sheets, spreadsheetId, '_meta');
  const rows = current.rows;
  const originalRowCount = rows.length;
  const positions = new Map(rows.map((row, index) => [asText(row.key), index + 2]));
  const data: { range: string; values: string[][] }[] = [];
  for (const [key, value] of [['schema_version', '2'], ['period_mode', 'yearly'], ['last_migrated_at', new Date().toISOString()]]) {
    const row = positions.get(key);
    if (row) data.push({ range: `_meta!B${row}`, values: [[value]] });
    else rows.push({ key, value });
  }
  if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
  const additions = rows.slice(originalRowCount);
  if (additions.length) await appendRows(sheets, spreadsheetId, '_meta', additions.map((row) => [row.key, row.value]));
}

async function migrateBranch(sheets: ReturnType<typeof google.sheets>, drive: ReturnType<typeof google.drive>, branch: Record<string, unknown>) {
  const branchId = asText(branch.Cabang_ID);
  const spreadsheetId = asText(branch.Spreadsheet_ID);
  if (!spreadsheetId) return;
  console.log(`\n${APPLY ? '[APPLY]' : '[DRY-RUN]'} ${branchId} (${spreadsheetId})`);

  const titles = await sheetTitles(sheets, spreadsheetId);
  const monthlyTitles = titles.filter((title) => /^(Entries|EntryLogs|Handovers|HandoverAcks|Incidents|IncidentNotes|Photos|AuditLog)_\d{4}-\d{2}$/.test(title));
  const instanceData = await readSheet(sheets, spreadsheetId, 'ShiftInstances');
  const transactionalData = await Promise.all(monthlyTitles.map((title) => readSheet(sheets, spreadsheetId, title)));
  const hasTransactionalRows = transactionalData.some((data) => data.rows.length > 0);
  if (APPLY && instanceData.rows.length === 0 && hasTransactionalRows) {
    throw new Error(`MIGRATION_BLOCKED_INCOMPLETE_EXPORT: ${branchId} memiliki data periodik tetapi ShiftInstances kosong`);
  }

  if (APPLY) {
    const backup = await drive.files.copy({ fileId: spreadsheetId, requestBody: { name: `${branchId} - backup sebelum migrasi ${new Date().toISOString()}` }, fields: 'id,name' });
    console.log(`  backup: ${backup.data.id}`);
  }

  await ensureStaticColumns(sheets, spreadsheetId, 'ShiftInstances', STATIC_SHEETS.ShiftInstances, APPLY);
  await ensureStaticColumns(sheets, spreadsheetId, 'IncidentCategories', STATIC_SHEETS.IncidentCategories, APPLY);
  const byBase = new Map<string, string[]>();
  for (const title of monthlyTitles) {
    const base = title.slice(0, title.lastIndexOf('_'));
    const list = byBase.get(base) ?? [];
    list.push(title);
    byBase.set(base, list);
  }

  const report: { sheet: string; sourceRows: number; copiedRows: number; skippedRows: number }[] = [];
  for (const [base, sourceTitles] of byBase) {
    const yearlyHeaders = YEARLY_SHEETS[base] ?? MONTHLY_SHEETS[base];
    if (!yearlyHeaders) continue;
    const rowsByYear = new Map<string, Record<string, unknown>[]>();
    for (const sourceTitle of sourceTitles.sort()) {
      const year = sourceTitle.slice(-7, -3);
      const source = await readSheet(sheets, spreadsheetId, sourceTitle);
      const target = rowsByYear.get(year) ?? [];
      target.push(...source.rows.map((row) => normalizeWrite(row)));
      rowsByYear.set(year, target);
    }
    for (const [year, sourceRows] of rowsByYear) {
      const targetTitle = periodSheetName(base, year, 'yearly');
      const existing = await readSheet(sheets, spreadsheetId, targetTitle);
      const existingIds = new Set(existing.rows.map((row) => asText(row.id)).filter(Boolean));
      const rows = sourceRows.filter((row) => {
        const id = asText(row.id);
        if (!id || existingIds.has(id)) return false;
        existingIds.add(id);
        return true;
      });
      report.push({ sheet: targetTitle, sourceRows: sourceRows.length, copiedRows: rows.length, skippedRows: sourceRows.length - rows.length });
      await ensureSheet(sheets, spreadsheetId, targetTitle, yearlyHeaders, APPLY);
      if (APPLY) await appendRows(sheets, spreadsheetId, targetTitle, rows.map((row) => yearlyHeaders.map((header) => row[header] ?? '')));
    }
  }

  for (const item of report) console.log(`  ${item.sheet}: source=${item.sourceRows}, copy=${item.copiedRows}, skip=${item.skippedRows}`);
  if (APPLY) await updateMeta(sheets, spreadsheetId);
  console.log(`  meta: ${APPLY ? 'schema_version=2, period_mode=yearly' : 'akan diubah ke schema_version=2, period_mode=yearly'}`);
}

async function main() {
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) throw new Error('REGISTRY_SPREADSHEET_ID belum dikonfigurasi');
  const client = auth();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });
  const registry = await readSheet(sheets, registryId, 'Daftar_Cabang');
  const branches = registry.rows.filter((branch) => (branch.Aktif === true || String(branch.Aktif).toUpperCase() === 'TRUE') && (!onlyBranch || asText(branch.Cabang_ID) === onlyBranch));
  if (branches.length === 0) throw new Error('Tidak ada cabang aktif yang cocok');
  for (const branch of branches) await migrateBranch(sheets, drive, branch);
  console.log(`\nSelesai (${APPLY ? 'APPLY' : 'DRY-RUN'}). Sheet bulanan tidak dihapus.`);
}

main().catch((error) => { console.error('FATAL:', error instanceof Error ? error.message : error); process.exit(1); });
