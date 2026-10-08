// scripts/seed-admin.ts
// Tambah user admin awal ke sheet Users di Registry.
// Usage: npx tsx --env-file=.env scripts/seed-admin.ts <username> <pin> <nama> [cabangId]
import { getSheetsClient } from '../lib/google/client';

const [username, pin, nama, cabangId = ''] = process.argv.slice(2);
if (!username || !pin || !nama) {
  console.error('Usage: npx tsx --env-file=.env scripts/seed-admin.ts <username> <pin> <nama> [cabangId]');
  process.exit(1);
}

const REGISTRY_ID = process.env.REGISTRY_SPREADSHEET_ID!;

async function main() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: REGISTRY_ID,
    range: 'Users!A:I',
  });
  const rows = res.data.values || [];
  const headers = (rows[0] || []).map(String);
  const usernameIdx = headers.indexOf('Username');
  const exists = rows.slice(1).some((r) => String(r[usernameIdx] ?? '').toLowerCase() === username.toLowerCase());
  if (exists) {
    console.log('User already exists:', username);
    process.exit(0);
  }

  const userId = `U-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const row = [userId, username, pin, nama, 'admin', cabangId, 'TRUE', 'FALSE', createdAt];
  await sheets.spreadsheets.values.append({
    spreadsheetId: REGISTRY_ID,
    range: 'Users',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  console.log('Admin user added:', username);
}

main().catch((e) => { console.error(e); process.exit(1); });
