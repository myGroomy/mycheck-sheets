import { getDriveClient, getSheetsClient } from './google/client';
import {
  getRegistrySpreadsheetId,
  getCabangList,
  parseArchiveSpreadsheetIds,
  serializeArchiveSpreadsheetIds,
  type CabangRecord,
} from './google/registry';
import { readSheetData, writeRow, columnIndexToLetter, invalidateSheetCache } from './google/sheets';
import { MONTHLY_SHEETS } from './schema/registry';
import { readBranchSchemaVersion } from './schema/version';

const PERIOD_BASES = Object.keys(MONTHLY_SHEETS);

export interface ArchivePreviewSheet { sheet: string; rows: number; }
export interface ArchivePreview {
  branchId: string;
  year: string;
  periodMode: string;
  alreadyArchived: boolean;
  sheets: ArchivePreviewSheet[];
  totalRows: number;
}

function text(value: unknown): string { return value === null || value === undefined ? '' : String(value); }

function column(index: number): string { return columnIndexToLetter(index); }

async function sheetTitles(spreadsheetId: string): Promise<{ id: number; title: string }[]> {
  const response = await getSheetsClient().spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  return (response.data.sheets ?? [])
    .map((sheet) => ({ id: sheet.properties?.sheetId, title: text(sheet.properties?.title) }))
    .filter((sheet): sheet is { id: number; title: string } => sheet.id !== undefined && Boolean(sheet.title));
}

async function read(spreadsheetId: string, title: string): Promise<{ headers: string[]; rows: unknown[][] }> {
  try {
    const values = (await getSheetsClient().spreadsheets.values.get({ spreadsheetId, range: title })).data.values ?? [];
    return { headers: (values[0] ?? []).map(String), rows: values.slice(1).filter((row) => row.some((value) => text(value).trim() !== '')) };
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 400 || code === 404) return { headers: [], rows: [] };
    throw error;
  }
}

function rowYear(headers: string[], row: unknown[], shiftYears: Map<string, string>): string {
  const data = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
  const linkedYear = shiftYears.get(text(data.shift_instance_id));
  if (linkedYear) return linkedYear;
  for (const field of ['tab_month', 'shift_date', 'occurred_at', 'reported_at', 'submitted_at', 'uploaded_at', 'read_at', 'completed_at', 'client_at', 'at', 'created_at', 'updated_at']) {
    const match = text(data[field]).match(/^(\d{4})/);
    if (match) return match[1];
  }
  return '';
}

async function flatRowsForYear(spreadsheetId: string, year: string): Promise<Map<string, { headers: string[]; rows: unknown[][] }>> {
  const result = new Map<string, { headers: string[]; rows: unknown[][] }>();
  const shift = await read(spreadsheetId, 'ShiftInstances');
  const shiftYears = new Map<string, string>();
  shift.rows.forEach((row) => {
    const data = Object.fromEntries(shift.headers.map((header, index) => [header, row[index] ?? '']));
    const id = text(data.id);
    const sourceYear = rowYear(shift.headers, row, new Map());
    if (id && sourceYear) shiftYears.set(id, sourceYear);
  });
  for (const base of ['ShiftInstances', ...PERIOD_BASES, 'IncidentIndex']) {
    const source = await read(spreadsheetId, base);
    if (!source.headers.length) continue;
    result.set(base, { headers: source.headers, rows: source.rows.filter((row) => rowYear(source.headers, row, shiftYears) === year) });
  }
  return result;
}

async function resolveBranch(branchId: string): Promise<CabangRecord> {
  const branch = (await getCabangList()).find((item) => item.Cabang_ID === branchId);
  if (!branch || !branch.Spreadsheet_ID) throw new Error(`Cabang aktif tidak ditemukan: ${branchId}`);
  return branch;
}

export async function previewArchive(branchId: string, year: string): Promise<ArchivePreview> {
  if (!/^\d{4}$/.test(year)) throw new Error('Tahun harus berformat YYYY');
  const branch = await resolveBranch(branchId);
  const version = await readBranchSchemaVersion(branch.Spreadsheet_ID!);
  const alreadyArchived = parseArchiveSpreadsheetIds(branch.Arsip_Spreadsheet_IDs).some((entry) => entry.year === year);
  const sheets: ArchivePreviewSheet[] = [];
  if (version.periodMode === 'flat') {
    for (const [sheet, data] of await flatRowsForYear(branch.Spreadsheet_ID!, year)) sheets.push({ sheet, rows: data.rows.length });
  } else if (version.periodMode === 'yearly') {
    const titles = new Set((await sheetTitles(branch.Spreadsheet_ID!)).map((item) => item.title));
    for (const base of PERIOD_BASES) {
      const data = await read(branch.Spreadsheet_ID!, `${base}_${year}`);
      if (titles.has(`${base}_${year}`)) sheets.push({ sheet: `${base}_${year}`, rows: data.rows.length });
    }
  } else {
    throw new Error(`ARCHIVE_BLOCKED_PERIOD_MODE: ${version.periodMode}`);
  }
  return { branchId, year, periodMode: version.periodMode, alreadyArchived, sheets, totalRows: sheets.reduce((sum, item) => sum + item.rows, 0) };
}

async function createArchiveSpreadsheet(branch: CabangRecord, year: string, mode: string, data: Map<string, { headers: string[]; rows: unknown[][] }>, yearlyTitles: { id: number; title: string }[]): Promise<string> {
  const sheets = getSheetsClient();
  const drive = getDriveClient();
  const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: `${branch.Cabang_ID} - Arsip ${year}` } }, fields: 'spreadsheetId' });
  const archiveId = created.data.spreadsheetId;
  if (!archiveId) throw new Error('Spreadsheet arsip tidak mendapat ID');
  const archiveMeta = await sheets.spreadsheets.get({ spreadsheetId: archiveId, fields: 'sheets.properties(sheetId)' });
  const defaultSheetId = archiveMeta.data.sheets?.[0]?.properties?.sheetId;
  if (defaultSheetId === undefined) throw new Error('Sheet default arsip tidak ditemukan');
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: archiveId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: defaultSheetId, title: '_meta' }, fields: 'title' } }] } });
  await sheets.spreadsheets.values.update({
    spreadsheetId: archiveId,
    range: '_meta!A1:B4',
    valueInputOption: 'RAW',
    requestBody: { values: [['key', 'value'], ['schema_version', '2'], ['period_mode', mode], ['archive_year', year]] },
  });

  if (mode === 'flat') {
    for (const [title, value] of data) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: archiveId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
      await sheets.spreadsheets.values.update({ spreadsheetId: archiveId, range: `${title}!A1`, valueInputOption: 'RAW', requestBody: { values: [value.headers, ...value.rows] } });
    }
  } else {
    for (const item of yearlyTitles.filter((sheet) => PERIOD_BASES.some((base) => sheet.title === `${base}_${year}`) || sheet.title === 'IncidentCategories' || sheet.title === 'IncidentIndex')) {
      await sheets.spreadsheets.sheets.copyTo({ spreadsheetId: branch.Spreadsheet_ID!, sheetId: item.id, requestBody: { destinationSpreadsheetId: archiveId } });
    }
  }

  const folderId = text(branch.Branch_Folder_ID || branch.Folder_Drive_ID);
  if (folderId) await drive.files.update({ fileId: archiveId, addParents: folderId, fields: 'id,parents' });
  const permissions = await drive.permissions.list({ fileId: archiveId, fields: 'permissions(id,emailAddress,role)' });
  const servicePermission = (permissions.data.permissions ?? []).find((permission) => permission.emailAddress === process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  if (servicePermission?.id && servicePermission.role === 'writer') await drive.permissions.update({ fileId: archiveId, permissionId: servicePermission.id, requestBody: { role: 'reader' }, fields: 'id,role' });
  return archiveId;
}

export async function archiveBranchYear(branchId: string, year: string): Promise<{ archiveId: string; preview: ArchivePreview }> {
  const preview = await previewArchive(branchId, year);
  if (preview.alreadyArchived) throw new Error(`Arsip ${branchId}/${year} sudah tercatat`);
  const branch = await resolveBranch(branchId);
  const version = await readBranchSchemaVersion(branch.Spreadsheet_ID!);
  const data = version.periodMode === 'flat' ? await flatRowsForYear(branch.Spreadsheet_ID!, year) : new Map<string, { headers: string[]; rows: unknown[][] }>();
  const titles = await sheetTitles(branch.Spreadsheet_ID!);
  const archiveId = await createArchiveSpreadsheet(branch, year, version.periodMode, data, titles);
  const registryId = getRegistrySpreadsheetId();
  const registry = await readSheetData(registryId, 'Daftar_Cabang');
  const rowIndex = registry.rows.findIndex((row) => text(row[registry.headers.indexOf('Cabang_ID')]) === branchId);
  if (rowIndex < 0) throw new Error(`Baris Registry tidak ditemukan: ${branchId}`);
  let archiveColumn = registry.headers.indexOf('Arsip_Spreadsheet_IDs');
  if (archiveColumn < 0) {
    archiveColumn = registry.headers.length;
    await writeRow(registryId, `Daftar_Cabang!${column(archiveColumn)}1`, ['Arsip_Spreadsheet_IDs']);
  }
  const existing = parseArchiveSpreadsheetIds(registry.rows[rowIndex][archiveColumn]);
  await writeRow(registryId, `Daftar_Cabang!${column(archiveColumn)}${rowIndex + 2}`, [serializeArchiveSpreadsheetIds([...existing, { year, spreadsheetId: archiveId }])]);
  invalidateSheetCache(registryId);
  return { archiveId, preview };
}
