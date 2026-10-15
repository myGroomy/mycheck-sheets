'use client';

/**
 * Upload foto dengan progress tracking per file.
 * Menggunakan XMLHttpRequest untuk dapat onprogress event.
 */

interface UploadPhotoOptions {
  file: File;
  ownerType: string;
  ownerId: string;
  shiftInstanceId?: string;
  onProgress?: (percent: number) => void;
}

interface UploadResult {
  photoId: string;
}

export async function uploadPhotoWithProgress({
  file,
  ownerType,
  ownerId,
  shiftInstanceId,
  onProgress,
}: UploadPhotoOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.set('file', file);
    form.set('ownerType', ownerType);
    form.set('ownerId', ownerId);
    if (shiftInstanceId) form.set('shiftInstanceId', shiftInstanceId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText) as { error?: string; photo_id?: string };
        if (xhr.status >= 200 && xhr.status < 300 && result.photo_id) {
          resolve({ photoId: result.photo_id });
        } else {
          reject(new Error(result.error || `Upload gagal (${xhr.status})`));
        }
      } catch {
        reject(new Error('Upload gagal: respons server tidak valid'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload gagal: jaringan terputus'));

    xhr.open('POST', '/api/photos/upload');
    xhr.setRequestHeader('X-Requested-With', 'fetch');
    xhr.send(form);
  });
}
