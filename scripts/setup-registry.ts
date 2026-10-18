// scripts/setup-registry.ts
// Inisialisasi Registry spreadsheet dengan sheet + header yang benar.
// Usage: npx tsx scripts/setup-registry.ts
import { getSheetsClient } from '../lib/google/client';

const REGISTRY_ID = process.env.REGISTRY_SPREADSHEET_ID;
if (!REGISTRY_ID) {
  console.error('REGISTRY_SPREADSHEET_ID belum diset');
  process.exit(1);
}

const SHEETS: Record<string, string[]> = {
  Daftar_Cabang: ['Cabang_ID', 'Nama_Cabang', 'Kode', 'Timezone', 'Spreadsheet_ID', 'Folder_Drive_ID', 'Aktif', 'Alamat', 'Arsip_Spreadsheet_IDs', 'Branch_Folder_ID', 'Evidence_Folder_ID'],
  Settings_Global: ['Key', 'Value'],
  Users: ['User_ID', 'Username', 'PIN', 'Nama', 'Role', 'Cabang_ID', 'Aktif', 'Must_Change_Pin', 'Created_At'],
  Share_Tokens: ['id', 'report_id', 'branch_id', 'token', 'created_by', 'created_at', 'expires_at', 'revoked_at', 'access_count', 'last_accessed_at', 'share_note', 'visibility'],
  Template_Referensi: ['Template_Spreadsheet_ID'],
};

async function main() {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: REGISTRY_ID,
    fields: 'sheets.properties.title',
  });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties?.title));

  for (const [title, headers] of Object.entries(SHEETS)) {
    if (!existing.has(title)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: REGISTRY_ID,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      });
      console.log('+ created sheet:', title);
    }
    // tulis header di baris 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: REGISTRY_ID,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log('= headers set:', title);
  }

  const users = await sheets.spreadsheets.values.get({
    spreadsheetId: REGISTRY_ID,
    range: 'Users!A:I',
  });
  const userRows = users.data.values ?? [];
  if (userRows.length <= 1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: REGISTRY_ID,
      range: 'Users',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [['TSDG8967', 'admin', '123456', 'admin', 'admin', '', 'TRUE', 'YES', new Date().toISOString()]],
      },
    });
    console.log('+ bootstrap admin seeded');
  } else {
    console.log('= bootstrap admin skipped; Users already has data');
  }

  // Hapus sheet default "Sheet1" jika ada dan bukan bagian dari SHEETS
  if (existing.has('Sheet1')) {
    const sheet1 = (meta.data.sheets || []).find((s) => s.properties?.title === 'Sheet1');
    if (sheet1?.properties?.sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: REGISTRY_ID,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }],
        },
      });
      console.log('- deleted default Sheet1');
    }
  }

  console.log('Registry spreadsheet ready:', REGISTRY_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
