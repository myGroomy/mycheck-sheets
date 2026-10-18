// Pemeriksaan dan cleanup Fase 7 Google Sheets.
// Default dry-run. Apply wajib memakai --apply --confirm-phase7.

import { getTemplateSpreadsheetId, getCabangList } from '../lib/google/registry';
import { getDriveClient, getSheetsClient } from '../lib/google/client';
import { readBranchSchemaVersion } from '../lib/schema/version';
import { cleanupCandidates, type CleanupSheet } from '../lib/schema/cleanup';

const APPLY = process.argv.includes('--apply');
const CONFIRM = process.argv.includes('--confirm-phase7');

function cutoffDate(): Date {
  const supplied = process.argv.find((arg) => arg.startsWith('--before='))?.slice(9);
  if (supplied && /^\d{4}-\d{2}-\d{2}$/.test(supplied)) return new Date(`${supplied}T00:00:00.000Z`);
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date;
}

async function listSheets(spreadsheetId: string): Promise<CleanupSheet[]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  return (response.data.sheets ?? [])
    .map((sheet) => ({ sheetId: sheet.properties?.sheetId, title: String(sheet.properties?.title ?? '') }))
    .filter((sheet): sheet is CleanupSheet => sheet.sheetId !== undefined && Boolean(sheet.title));
}

async function deleteSheets(spreadsheetId: string, sheetsToDelete: CleanupSheet[]): Promise<void> {
  if (sheetsToDelete.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: sheetsToDelete.map(({ sheetId }) => ({ deleteSheet: { sheetId } })) },
  });
}

async function backupSpreadsheet(spreadsheetId: string, label: string): Promise<string> {
  const drive = getDriveClient();
  const response = await drive.files.copy({
    fileId: spreadsheetId,
    requestBody: { name: `${label} - backup sebelum Fase 7 ${new Date().toISOString()}` },
    fields: 'id,name',
  });
  if (!response.data.id) throw new Error(`Backup tidak mendapat ID: ${label}`);
  return response.data.id;
}

async function main() {
  const branches = await getCabangList();
  const versions = await Promise.all(branches.map(async (branch) => ({
    branch,
    version: await readBranchSchemaVersion(String(branch.Spreadsheet_ID ?? '')),
  })));
  const nonReady = versions.filter(({ version }) => !['yearly', 'flat'].includes(version.periodMode));
  if (APPLY && (!CONFIRM || nonReady.length > 0)) {
    const reason = !CONFIRM ? 'tambahkan --confirm-phase7' : `masih ada cabang mode belum siap: ${nonReady.map(({ branch }) => branch.Cabang_ID).join(', ')}`;
    throw new Error(`CLEANUP_BLOCKED: ${reason}`);
  }

  const targets = new Map<string, string>();
  for (const branch of branches) {
    const spreadsheetId = String(branch.Spreadsheet_ID ?? '');
    if (spreadsheetId) targets.set(spreadsheetId, `cabang ${branch.Cabang_ID}`);
  }
  try {
    const templateId = await getTemplateSpreadsheetId();
    targets.set(templateId, 'template');
  } catch (error) {
    console.warn(`Template dilewati: ${error instanceof Error ? error.message : error}`);
  }

  const cutoff = cutoffDate();
  let total = 0;
  for (const [spreadsheetId, label] of targets) {
    const result = cleanupCandidates(await listSheets(spreadsheetId), cutoff);
    total += result.remove.length;
    console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} ${label}: hapus=${result.remove.map(({ title }) => title).join(', ') || '-'}; dilewati=${result.skipped.map(({ title }) => title).join(', ') || '-'}`);
    if (APPLY && result.remove.length > 0) {
      const backupId = await backupSpreadsheet(spreadsheetId, label);
      console.log(`  backup: ${backupId}`);
      await deleteSheets(spreadsheetId, result.remove);
    }
  }
  console.log(`${APPLY ? 'Dihapus' : 'Kandidat'}: ${total} sheet; cutoff ${cutoff.toISOString().slice(0, 10)}`);
}

main().catch((error) => { console.error('FATAL:', error instanceof Error ? error.message : error); process.exit(1); });
