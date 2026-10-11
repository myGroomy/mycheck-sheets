import { NextResponse } from 'next/server';
import { getDriveClient } from './client';

export async function drivePhotoResponse(
  fileRef: string,
  mimeType: string
): Promise<NextResponse> {
  const result = await getDriveClient().files.get(
    { fileId: fileRef, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  const bytes = Buffer.from(result.data as unknown as ArrayBuffer);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
