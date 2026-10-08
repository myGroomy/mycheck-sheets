// lib/google/drive.ts
// Operasi Google Drive API v3 — pengganti DriveApp di Google Apps Script.

import { PassThrough } from 'stream';
import { getDriveClient } from './client';

/**
 * Upload buffer XLSX ke folder Drive tertentu dan ambil link untuk akses view/download.
 */
export async function uploadXlsxToDrive(
  folderId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ fileId: string; webViewLink: string; downloadUrl: string }> {
  const drive = getDriveClient();
  const bodyStream = new PassThrough();
  bodyStream.end(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: bodyStream,
    },
    fields: 'id,webViewLink,name',
    supportsAllDrives: true,
  });

  const fileId = res.data.id;
  if (!fileId) throw new Error('Gagal membuat file XLSX di Google Drive (fileId kosong)');
  const webViewLink = res.data.webViewLink || '';
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  return { fileId, webViewLink, downloadUrl };
}

/**
 * Update existing XLSX file in Drive with new content.
 * Keeps the same fileId and link — overwrites the file content only.
 */
export async function updateXlsxInDrive(
  fileId: string,
  buffer: Buffer
): Promise<{ fileId: string; webViewLink: string; downloadUrl: string }> {
  const drive = getDriveClient();
  const bodyStream = new PassThrough();
  bodyStream.end(buffer);

  // First, get the current file to preserve its name/parents
  const existing = await drive.files.get({
    fileId,
    fields: 'name, parents',
    supportsAllDrives: true,
  });

  const fileName = existing.data.name || 'laporan.xlsx';

  await drive.files.update({
    fileId,
    requestBody: {
      name: fileName,
      // Note: we don't change parents — keep existing location
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: bodyStream,
    },
    supportsAllDrives: true,
  });

  // Re-fetch to get the updated webViewLink
  const updated = await drive.files.get({
    fileId,
    fields: 'id,webViewLink,name',
    supportsAllDrives: true,
  });

  const webViewLink = updated.data.webViewLink || '';
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  return { fileId, webViewLink, downloadUrl };
}
