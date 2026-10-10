import { NextResponse } from 'next/server';
import { getSheetsClient, getDriveClient } from '@/lib/google/client';

/**
 * Health check: Registry spreadsheet (data) + Drive (storage foto).
 * Tidak butuh autentikasi hanya melaporkan ok/error.
 */
export async function GET() {
  const startedAt = Date.now();
  let registryStatus = 'ok';
  let driveStatus = 'ok';

  try {
    await getSheetsClient().spreadsheets.get({
      spreadsheetId: process.env.REGISTRY_SPREADSHEET_ID,
      fields: 'spreadsheetId',
    });
  } catch {
    registryStatus = 'error';
  }

  try {
    await getDriveClient().files.get({
      fileId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      fields: 'id',
      supportsAllDrives: true,
    });
  } catch {
    driveStatus = 'error';
  }

  const healthy = registryStatus === 'ok' && driveStatus === 'ok';
  return NextResponse.json(
    {
      registry: registryStatus,
      storage: driveStatus,
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      latencyMs: Date.now() - startedAt,
    },
    { status: healthy ? 200 : 503 }
  );
}