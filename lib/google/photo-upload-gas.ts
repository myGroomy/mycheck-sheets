// lib/google/photo-upload-gas.ts
// Wrapper panggilan uploadPhoto ke GAS.

import { callGas } from './gas-client';

export interface UploadPhotoGasInput {
  folderId: string;
  baseName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface UploadPhotoGasOutput {
  fileId: string;
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
}

export async function uploadPhotoViaGas(
  input: UploadPhotoGasInput
): Promise<UploadPhotoGasOutput> {
  const payload = {
    folderId: input.folderId,
    baseName: input.baseName,
    mimeType: input.mimeType,
    fileBase64: input.buffer.toString('base64'),
  };

  return callGas<UploadPhotoGasOutput>('uploadPhoto', payload, 'upload');
}
