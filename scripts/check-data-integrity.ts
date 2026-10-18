// Checker read-only untuk gate Fase 0/Fase 4.
// Contoh: npm run check:data -- --branch=CBGBDG01 --json

import { google } from 'googleapis';
import { BRANCH_SHEETS, MONTHLY_SHEETS, YEARLY_SHEETS } from '../lib/schema/registry';

const branchArg = process.argv.find((arg) => arg.startsWith('--branch='))?.slice('--branch='.length);
const onlyBranch = branchArg || (process.argv.includes('--branch') ? process.argv[process.argv.indexOf('--branch') + 1] : undefined);
const jsonOutput = process.argv.includes('--json');

type Severity = 'critical' | 'warning' | 'info';
interface Finding { severity: Severity; branchId: string; code: string; sheet?: string; detail: string; }

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Kredensial Google belum dikonfigurasi');
  return new google.auth.JWT({ email, key: privateKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

function text(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function bool(value: unknown): boolean { return ['true', 'false', '1', '0'].includes(text(value).toLowerCase()); }
function objects(values: unknown[][]): { headers: string[]; rows: Record<string, unknown>[] } {
  const headers = (values[0] ?? []).map(String);
  return { headers, rows: values.slice(1).filter((row) => row.some((cell) => text(cell).trim() !== '')).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))) };
}

async function titles(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<string[]> {
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (response.data.sheets ?? []).map((sheet) => text(sheet.properties?.title)).filter(Boolean);
}

async function read(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string) {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: title });
    return objects(response.data.values ?? []);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 400 || code === 404) return { headers: [], rows: [] };
    throw error;
  }
}

function add(findings: Finding[], branchId: string, severity: Severity, code: string, detail: string, sheet?: string) {
  findings.push({ severity, branchId, code, detail, ...(sheet ? { sheet } : {}) });
}

async function checkBranch(sheets: ReturnType<typeof google.sheets>, branch: Record<string, unknown>): Promise<Finding[]> {
  const branchId = text(branch.Cabang_ID);
  const spreadsheetId = text(branch.Spreadsheet_ID);
  const findings: Finding[] = [];
  const sheetTitles = await titles(sheets, spreadsheetId);
  const users = await read(sheets, process.env.REGISTRY_SPREADSHEET_ID!, 'Users');
  const usernames = new Set(users.rows.map((row) => text(row.Username)).filter(Boolean));
  const knownStatic = new Set(Object.keys(BRANCH_SHEETS));
  const knownPeriod = new Set([...Object.keys(MONTHLY_SHEETS), ...Object.keys(YEARLY_SHEETS)]);
  for (const title of sheetTitles) {
    const base = title.replace(/_\d{4}(?:-\d{2})?$/, '');
    const known = knownStatic.has(title) || knownPeriod.has(title) || (knownPeriod.has(base) && /_\d{4}(?:-\d{2})?$/.test(title));
    if (!known && !title.startsWith('LEGACY_')) add(findings, branchId, 'warning', 'UNKNOWN_SHEET', 'Sheet tidak ada di registry skema', title);
  }

  const instances = (await read(sheets, spreadsheetId, 'ShiftInstances')).rows;
  const instanceIds = new Set(instances.map((row) => text(row.id)).filter(Boolean));
  const categoryRows = (await read(sheets, spreadsheetId, 'IncidentCategories')).rows;
  const categoryIds = new Set(categoryRows.map((row) => text(row.id)).filter(Boolean));
  const actorFields = ['reported_by', 'opened_by', 'closed_by', 'void_by', 'pj_user_id', 'completed_by', 'submitted_by', 'user_id', 'uploaded_by', 'author_id', 'actor_id'];
  const booleanFields = ['is_active', 'is_test', 'outside_shift', 'is_required', 'is_locked', 'is_read', 'out_of_range', 'crosses_midnight', 'opened_outside_hours', 'is_incomplete', 'no_incident_confirmed'];
  let testRows = 0;
  for (const title of sheetTitles) {
    const base = title.replace(/_\d{4}(?:-\d{2})?$/, '');
    if (!knownPeriod.has(title) && !knownPeriod.has(base) && !knownStatic.has(title)) continue;
    const data = await read(sheets, spreadsheetId, title);
    if (data.rows.length) add(findings, branchId, 'info', 'ROW_COUNT', String(data.rows.length), title);
    for (const row of data.rows) {
      if (row.is_test !== undefined && text(row.is_test) !== '' && !bool(row.is_test)) add(findings, branchId, 'critical', 'INVALID_BOOLEAN', `is_test=${text(row.is_test)}`, title);
      if (row.is_test === true || text(row.is_test).toLowerCase() === 'true' || text(row.is_test) === '1') testRows++;
      for (const field of booleanFields) if (row[field] !== undefined && text(row[field]) !== '' && !bool(row[field])) add(findings, branchId, 'critical', 'INVALID_BOOLEAN', `${field}=${text(row[field])}`, title);
      for (const field of actorFields) if (row[field] !== undefined && text(row[field]) !== '' && !usernames.has(text(row[field]))) add(findings, branchId, 'warning', 'UNKNOWN_ACTOR', `${field}=${text(row[field])}`, title);
      if (row.shift_instance_id && !instanceIds.has(text(row.shift_instance_id))) add(findings, branchId, 'critical', 'ORPHAN_SHIFT', text(row.shift_instance_id), title);
      if (row.category_id && base.startsWith('Incident') && !categoryIds.has(text(row.category_id))) add(findings, branchId, 'warning', 'UNKNOWN_CATEGORY', text(row.category_id), title);
      if (row.severity && !['rendah', 'sedang', 'tinggi', 'low', 'medium', 'high'].includes(text(row.severity))) add(findings, branchId, 'critical', 'INVALID_SEVERITY', text(row.severity), title);
      if (base === 'Incidents' && row.status && !['open', 'selesai'].includes(text(row.status))) add(findings, branchId, 'critical', 'INVALID_STATUS', text(row.status), title);
    }
  }
  if (testRows) add(findings, branchId, 'warning', 'TEST_ROWS', String(testRows));
  return findings;
}

async function main() {
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) throw new Error('REGISTRY_SPREADSHEET_ID belum dikonfigurasi');
  const client = auth();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const registry = await read(sheets, registryId, 'Daftar_Cabang');
  const branches = registry.rows.filter((branch) => (branch.Aktif === true || text(branch.Aktif).toUpperCase() === 'TRUE') && (!onlyBranch || text(branch.Cabang_ID) === onlyBranch));
  if (branches.length === 0) throw new Error('Tidak ada cabang aktif yang cocok');
  const findings = (await Promise.all(branches.map((branch) => checkBranch(sheets, branch)))).flat();
  if (jsonOutput) console.log(JSON.stringify({ generatedAt: new Date().toISOString(), branchFilter: onlyBranch ?? null, findings }, null, 2));
  else {
    for (const finding of findings) console.log(`[${finding.severity}] ${finding.branchId} ${finding.code}${finding.sheet ? ` ${finding.sheet}` : ''}: ${finding.detail}`);
    console.log(`\nTotal temuan: ${findings.length}`);
  }
  if (findings.some((finding) => finding.severity === 'critical')) process.exitCode = 2;
}

main().catch((error) => { console.error('FATAL:', error instanceof Error ? error.message : error); process.exit(1); });
