// scripts/check-existing-data.ts
// Cek data existing di spreadsheet cabang.
import { readSheetData } from '../lib/google/sheets';

const BRANCH_ID = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k';

async function main() {
  const sheets = ['ShiftDefinitions', 'SopCategories', 'ChecklistPoints', 'HandoverFields', 'ShiftInstances', 'Participants', 'Reports', 'IncidentCategories'];
  for (const sheet of sheets) {
    const data = await readSheetData(BRANCH_ID, sheet);
    console.log(`${sheet}: ${data.rows.length} rows`);
    if (data.rows.length > 0 && data.rows.length <= 3) {
      console.log('  Sample:', JSON.stringify(data.rows[0]));
    }
  }

  // Check monthly sheets
  const monthly = ['Entries_2026-09', 'Entries_2026-10', 'Entries_2026-11', 'Incidents_2026-09', 'Incidents_2026-10', 'Incidents_2026-11', 'Handovers_2026-09', 'Handovers_2026-10', 'Handovers_2026-11', 'AuditLog_2026-09', 'AuditLog_2026-10', 'AuditLog_2026-11'];
  for (const sheet of monthly) {
    try {
      const data = await readSheetData(BRANCH_ID, sheet);
      console.log(`${sheet}: ${data.rows.length} rows`);
    } catch {
      console.log(`${sheet}: not found`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
