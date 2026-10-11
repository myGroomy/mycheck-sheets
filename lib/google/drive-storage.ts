import { getDriveClient } from './client';
import { resolveCabang } from './registry';
import { updateCabangFolderId } from './registry-admin';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export class DrivePhotoFolderError extends Error {}

function driveStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = error.code;
  return typeof code === 'number' ? code : null;
}

async function isDriveFolder(folderId: string): Promise<boolean> {
  const drive = getDriveClient();
  try {
    const result = await drive.files.get({
      fileId: folderId,
      supportsAllDrives: true,
      fields: 'id,mimeType,trashed',
    });
    return result.data.mimeType === FOLDER_MIME_TYPE && result.data.trashed !== true;
  } catch (error) {
    if (driveStatus(error) === 404) return false;
    if (driveStatus(error) === 403) {
      throw new DrivePhotoFolderError('Service account tidak memiliki akses ke folder Google Drive');
    }
    throw error;
  }
}

async function createBranchFolder(
  rootFolderId: string,
  branchId: string
): Promise<string> {
  const drive = getDriveClient();
  const name = `MyCheck - ${branchId}`;
  let existing;
  try {
    existing = await drive.files.list({
      q: `'${rootFolderId.replaceAll("'", "\\'")}' in parents and name = '${name.replaceAll("'", "\\'")}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id)',
    });
  } catch (error) {
    if (driveStatus(error) === 403) {
      throw new DrivePhotoFolderError('Service account tidak memiliki akses untuk mencari folder foto');
    }
    if (driveStatus(error) === 404) {
      throw new DrivePhotoFolderError('Folder induk Google Drive tidak ditemukan');
    }
    throw error;
  }
  const existingId = existing.data.files?.[0]?.id;
  if (existingId) return existingId;

  let created;
  try {
    created = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [rootFolderId],
      },
      supportsAllDrives: true,
      fields: 'id',
    });
  } catch (error) {
    if (driveStatus(error) === 403) {
      throw new DrivePhotoFolderError('Service account tidak memiliki izin membuat folder foto');
    }
    if (driveStatus(error) === 404) {
      throw new DrivePhotoFolderError('Folder induk Google Drive tidak ditemukan');
    }
    throw error;
  }
  if (!created.data.id) throw new Error('Google Drive tidak mengembalikan ID folder cabang');
  return created.data.id;
}

export async function ensureBranchPhotoFolder(branchId: string): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) {
    throw new DrivePhotoFolderError('Folder penyimpanan foto belum dikonfigurasi');
  }
  if (!(await isDriveFolder(rootFolderId))) {
    throw new DrivePhotoFolderError('Folder induk Google Drive tidak ditemukan atau bukan folder');
  }

  const branch = await resolveCabang(branchId);
  if (branch.folderId && branch.folderId !== rootFolderId && await isDriveFolder(branch.folderId)) {
    return branch.folderId;
  }

  const folderId = await createBranchFolder(rootFolderId, branchId);
  await updateCabangFolderId(branchId, folderId);
  return folderId;
}
