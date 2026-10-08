// lib/google/client.ts
// Inisialisasi Google API client (Sheets + Drive) menggunakan Service Account.
// Menggantikan peran Google Apps Script (SpreadsheetApp/DriveApp).

import { google } from 'googleapis';

let cachedSheets: ReturnType<typeof google.sheets> | null = null;
let cachedDrive: ReturnType<typeof google.drive> | null = null;

interface GoogleCredentials {
  clientEmail: string;
  privateKey: string;
}

function getCredentials(): GoogleCredentials {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL dan GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY wajib dikonfigurasi'
    );
  }
  return {
    clientEmail,
    // privateKey biasanya disimpan dengan \n literal pada env; normalisasi di sini.
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

export function getSheetsClient() {
  if (cachedSheets) return cachedSheets;
  const { clientEmail, privateKey } = getCredentials();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedSheets = google.sheets({ version: 'v4', auth });
  return cachedSheets;
}

export function getDriveClient() {
  if (cachedDrive) return cachedDrive;
  const { clientEmail, privateKey } = getCredentials();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  cachedDrive = google.drive({ version: 'v3', auth });
  return cachedDrive;
}
