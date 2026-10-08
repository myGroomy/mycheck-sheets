// scripts/dev-unregister-branch.ts (dev-only) — hapus cabang dari Daftar_Cabang
import { google } from 'googleapis';

const cabangId = process.argv[2];
if (!cabangId) {
  console.error('Usage: npx tsx --env-file=.env scripts/dev-unregister-branch.ts <Cabang_ID>');
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
  const registryId = process.env.REGISTRY_SPREADSHEET_ID!;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: 'Daftar_Cabang!A:G',
  });
  const values = res.data.values || [];
  const rowIndex = values.findIndex((r, i) => i > 0 && String(r[0] ?? '') === cabangId);
  if (rowIndex === -1) {
    console.log('Cabang tidak terdaftar:', cabangId);
    return;
  }

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: registryId,
    fields: 'sheets.properties(sheetId,title)',
  });
  const sheetId = (meta.data.sheets || []).find(
    (s) => s.properties?.title === 'Daftar_Cabang'
  )?.properties?.sheetId;
  if (sheetId == null) throw new Error('Sheet Daftar_Cabang tidak ditemukan');

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: registryId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
  console.log('Cabang dihapus dari Daftar_Cabang:', cabangId);
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});