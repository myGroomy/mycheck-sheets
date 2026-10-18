// Arsip manual tahunan Google Sheets dari cabang flat atau legacy.
// Default dry-run. Apply: npm run archive:data -- --branch=CBGBDG01 --year=2025 --apply

import { google } from 'googleapis';
import { parseArchiveSpreadsheetIds, serializeArchiveSpreadsheetIds } from '../lib/google/registry';
import { readBranchSchemaVersion } from '../lib/schema/version';

const APPLY = process.argv.includes('--apply');
const branchId = process.argv.find((arg) => arg.startsWith('--branch='))?.slice(9);
const year = process.argv.find((arg) => arg.startsWith('--year='))?.slice(7);
const PERIOD_BASES = ['Entries', 'EntryLogs', 'Handovers', 'HandoverAcks', 'Incidents', 'IncidentNotes', 'Photos', 'AuditLog'];

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Kredensial Google belum dikonfigurasi');
  return new google.auth.JWT({ email, key: privateKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
}

function text(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function col(index: number): string {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

async function readSheet(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string) {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: title });
    const values = response.data.values ?? [];
    const headers = (values[0] ?? []).map(String);
    return { headers, rows: values.slice(1).filter((row) => row.some((value) => text(value).trim() !== '')) };
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 400 || code === 404) return { headers: [], rows: [] };
    throw error;
  }
}

function rowYear(headers: string[], row: unknown[], shiftYears: Map<string, string>): string {
  const data = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
  const shiftYear = shiftYears.get(text(data.shift_instance_id));
  if (shiftYear) return shiftYear;
  for (const field of ['tab_month', 'shift_date', 'occurred_at', 'reported_at', 'submitted_at', 'uploaded_at', 'read_at', 'completed_at', 'client_at', 'at', 'created_at', 'updated_at']) {
    const value = text(data[field]);
    const match = value.match(/^(\d{4})/);
    if (match) return match[1];
  }
  return '';
}

async function copyFlatYear(
  sheets: ReturnType<typeof google.sheets>,
  sourceId: string,
  archiveId: string,
  year: string,
  titles: Set<string>,
) {
  const shift = await readSheet(sheets, sourceId, 'ShiftInstances');
  const shiftYears = new Map<string, string>();
  const shiftHeaders = shift.headers;
  shift.rows.forEach((row) => {
    const data = Object.fromEntries(shiftHeaders.map((header, index) => [header, row[index] ?? '']));
    const id = text(data.id);
    const sourceYear = rowYear(shiftHeaders, row, new Map());
    if (id && sourceYear) shiftYears.set(id, sourceYear);
  });
  const bases = ['ShiftInstances', ...PERIOD_BASES, 'IncidentIndex'];
  for (const base of bases) {
    if (!titles.has(base) || base === 'IncidentCategories') continue;
    const source = await readSheet(sheets, sourceId, base);
    if (!source.headers.length) continue;
    const rows = source.rows.filter((row) => rowYear(source.headers, row, shiftYears) === year);
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: archiveId, requestBody: { requests: [{ addSheet: { properties: { title: base } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: archiveId, range: `${base}!A1`, valueInputOption: 'RAW', requestBody: { values: [source.headers, ...rows] } });
  }
}

async function main() {
  if (!branchId || !year || !/^\d{4}$/.test(year)) throw new Error('Wajib --branch=... dan --year=YYYY');
  const client = auth();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) throw new Error('REGISTRY_SPREADSHEET_ID belum dikonfigurasi');

  const registryResponse = await sheets.spreadsheets.values.get({ spreadsheetId: registryId, range: 'Daftar_Cabang' });
  const registryValues = registryResponse.data.values ?? [];
  const headers = (registryValues[0] ?? []).map(String);
  const branchIndex = headers.indexOf('Cabang_ID');
  const rowIndex = registryValues.findIndex((row, index) => index > 0 && text(row[branchIndex]) === branchId);
  if (rowIndex < 0) throw new Error(`Cabang tidak ditemukan: ${branchId}`);
  const branch = Object.fromEntries(headers.map((header, index) => [header, registryValues[rowIndex][index] ?? '']));
  const sourceId = text(branch.Spreadsheet_ID);
  if (!sourceId) throw new Error(`Spreadsheet aktif kosong: ${branchId}`);
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: text(branch.Timezone) || 'Asia/Jakarta', year: 'numeric' }).format(new Date()));
  if (Number(year) >= currentYear) throw new Error(`Tahun ${year} belum boleh diarsipkan; tahun aktif ${currentYear}`);
  const existing = parseArchiveSpreadsheetIds(branch.Arsip_Spreadsheet_IDs);
  if (existing.some((entry) => entry.year === year)) {
    console.log(`Arsip ${branchId}/${year} sudah tercatat: ${existing.find((entry) => entry.year === year)?.spreadsheetId}`);
    return;
  }

  const sourceVersion = await readBranchSchemaVersion(sourceId);
  if (APPLY && !['yearly', 'flat'].includes(sourceVersion.periodMode)) throw new Error(`ARCHIVE_BLOCKED_PERIOD_MODE: ${sourceVersion.periodMode}`);
  const sourceMeta = await sheets.spreadsheets.get({ spreadsheetId: sourceId, fields: 'sheets.properties(sheetId,title)' });
  const sourceSheets = (sourceMeta.data.sheets ?? []).map((sheet) => ({ id: sheet.properties?.sheetId, title: text(sheet.properties?.title) })).filter((sheet) => sheet.id !== undefined);
  const targetTitles = sourceVersion.periodMode === 'flat'
    ? new Set([...PERIOD_BASES, 'ShiftInstances', 'IncidentIndex', 'IncidentCategories'])
    : new Set([...PERIOD_BASES.map((base) => `${base}_${year}`), 'IncidentIndex', 'IncidentCategories']);
  const selected = sourceSheets.filter((sheet) => targetTitles.has(sheet.title));
  if (selected.length === 0) throw new Error(`Tidak ada sheet periode ${year} pada ${branchId}`);
  const archiveColumn = headers.indexOf('Arsip_Spreadsheet_IDs');
  if (archiveColumn < 0) {
    if (!APPLY) {
      console.log('Registry belum memiliki header Arsip_Spreadsheet_IDs; --apply akan menambahkannya.');
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: registryId,
        range: `Daftar_Cabang!${col(headers.length)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['Arsip_Spreadsheet_IDs']] },
      });
    }
  }
  console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} ${branchId}/${year}: ${selected.map((sheet) => sheet.title).join(', ')}`);
  if (!APPLY) return;

  const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: `${branchId} - Arsip ${year}` } }, fields: 'spreadsheetId' });
  const archiveId = created.data.spreadsheetId;
  if (!archiveId) throw new Error('Spreadsheet arsip tidak mendapat ID');
  const archiveMeta = await sheets.spreadsheets.get({ spreadsheetId: archiveId, fields: 'sheets.properties(sheetId,title)' });
  const defaultSheet = archiveMeta.data.sheets?.[0]?.properties;
  if (!defaultSheet?.sheetId) throw new Error('Sheet default arsip tidak ditemukan');
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: archiveId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: defaultSheet.sheetId, title: '_meta' }, fields: 'title' } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId: archiveId, range: '_meta!A1:B4', valueInputOption: 'RAW', requestBody: { values: [['key', 'value'], ['schema_version', '2'], ['period_mode', sourceVersion.periodMode], ['archive_year', year]] } });
  if (sourceVersion.periodMode === 'flat') {
    await copyFlatYear(sheets, sourceId, archiveId, year, new Set(selected.map((sheet) => sheet.title)));
    const category = selected.find((sheet) => sheet.title === 'IncidentCategories');
    if (category) await sheets.spreadsheets.sheets.copyTo({ spreadsheetId: sourceId, sheetId: category.id!, requestBody: { destinationSpreadsheetId: archiveId } });
  } else {
    for (const source of selected) {
      await sheets.spreadsheets.sheets.copyTo({ spreadsheetId: sourceId, sheetId: source.id!, requestBody: { destinationSpreadsheetId: archiveId } });
    }
  }

  const branchFolderId = text(branch.Branch_Folder_ID || branch.Folder_Drive_ID);
  if (branchFolderId) await drive.files.update({ fileId: archiveId, addParents: branchFolderId, fields: 'id,parents' });
  const permissions = await drive.permissions.list({ fileId: archiveId, fields: 'permissions(id,emailAddress,type,role)' });
  const servicePermission = (permissions.data.permissions ?? []).find((permission) => permission.emailAddress === process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  if (servicePermission?.id && servicePermission.role === 'writer') {
    await drive.permissions.update({ fileId: archiveId, permissionId: servicePermission.id, requestBody: { role: 'reader' }, fields: 'id,role' });
  } else if (servicePermission?.role === 'owner') {
    console.warn('Arsip dibuat oleh service account sebagai owner; role owner tidak diubah otomatis. Verifikasi owner/GAS.');
  }

  const archiveValue = serializeArchiveSpreadsheetIds([...existing, { year, spreadsheetId: archiveId }]);
  await sheets.spreadsheets.values.update({ spreadsheetId: registryId, range: `Daftar_Cabang!${col(archiveColumn < 0 ? headers.length : archiveColumn)}${rowIndex + 1}`, valueInputOption: 'RAW', requestBody: { values: [[archiveValue]] } });
  console.log(`Arsip dibuat dan Registry diperbarui: ${archiveId}`);
}

main().catch((error) => { console.error('FATAL:', error instanceof Error ? error.message : error); process.exit(1); });
