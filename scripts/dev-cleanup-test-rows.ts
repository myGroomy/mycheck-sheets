// scripts/dev-cleanup-test-rows.ts (dev-only) — hapus baris test dari template
import { google } from 'googleapis';

const TPL = '1tUJKzGknSbzSLGH29esPT7yttMC9nt2iY7pP8b4nWiY';
const SID = process.argv[2];
if (!SID) {
  console.error('Usage: npx tsx --env-file=.env scripts/dev-cleanup-test-rows.ts <shift_instance_id>');
  process.exit(1);
}

async function main() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const targets: [string, string][] = [
    ['Entries_2026-10', 'shift_instance_id'],
    ['EntryLogs_2026-10', 'shift_instance_id'],
    ['Handovers_2026-10', 'shift_instance_id'],
    ['Reports', 'shift_instance_id'],
    ['Participants', 'shift_instance_id'],
    ['AuditLog_2026-10', 'shift_instance_id'],
    ['ShiftInstances', 'id'],
  ];

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: TPL,
    fields: 'sheets.properties(sheetId,title)',
  });
  const idOf = (title: string) =>
    (meta.data.sheets || []).find((s) => s.properties?.title === title)?.properties?.sheetId;

  for (const [sheet, key] of targets) {
    const sheetId = idOf(sheet);
    if (sheetId == null) continue;
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: TPL,
      range: `${sheet}!A:Z`,
    });
    const values = r.data.values || [];
    const headers = (values[0] || []).map((h) => String(h).trim());
    const col = headers.indexOf(key);
    if (col === -1) continue;
    const kill: number[] = [];
    values.forEach((row, i) => {
      if (i === 0) return;
      if (String(row[col] ?? '') === SID) kill.push(i + 1); // baris fisik 1-based
    });
    for (const rowNum of kill.reverse()) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: TPL,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowNum - 1,
                  endIndex: rowNum,
                },
              },
            },
          ],
        },
      });
    }
    if (kill.length > 0) console.log(`${sheet}: hapus ${kill.length} baris test`);
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});