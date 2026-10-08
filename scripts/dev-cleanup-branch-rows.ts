// scripts/dev-cleanup-branch-rows.ts (dev-only)
// Hapus baris berdasarkan daftar id dari file, untuk membersihkan data test.
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const BR = '1fM_EhZDeYdsy4RdoThYrYlczLCitVnmmq4VXYe27A4k';
const ids = readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: BR,
    fields: 'sheets.properties(sheetId,title)',
  });
  const idOf = (t: string) =>
    (meta.data.sheets || []).find((s) => s.properties?.title === t)?.properties?.sheetId;

  const jobs: [string, string][] = [
    ['ShiftInstances', 'id'],
    ['Participants', 'shift_instance_id'],
    ['Entries_2026-10', 'shift_instance_id'],
    ['EntryLogs_2026-10', 'shift_instance_id'],
    ['AuditLog_2026-10', 'shift_instance_id'],
    ['Handovers_2026-10', 'shift_instance_id'],
  ];

  for (const [sheet, col] of jobs) {
    const sid = idOf(sheet);
    if (sid == null) continue;
    const v = (await sheets.spreadsheets.values.get({
      spreadsheetId: BR,
      range: `${sheet}!A:Z`,
    })).data.values || [];
    const h = (v[0] || []).map(String);
    const ci = h.indexOf(col);
    if (ci === -1) continue;
    const kill: number[] = [];
    v.forEach((r, i) => {
      if (i > 0 && ids.includes(String(r[ci] ?? ''))) kill.push(i + 1);
    });
    for (const rn of kill.reverse()) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: BR,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn },
              },
            },
          ],
        },
      });
    }
    if (kill.length > 0) console.log(`${sheet}: hapus ${kill.length} baris`);
  }
  console.log('selesai');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});