/**
 * Code.gs - Google Apps Script Backend for MyCheck Evidence Storage & Branch Provisioning
 * Version: 2
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ success: false, status: 400, error: 'Request body kosong.' });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse_({ success: false, status: 400, error: 'Request body bukan format JSON yang valid.' });
    }

    var action = data.action;
    var apiKey = data['x-api-key'] || '';
    var payload = data.payload || {};

    // Script Properties
    var props = PropertiesService.getScriptProperties();
    var keyUpload = props.getProperty('KEY_UPLOAD') || '';
    var keyAdmin = props.getProperty('KEY_ADMIN') || '';
    var allowedRootsStr = props.getProperty('ALLOWED_ROOT_IDS') || '';
    var templateSheetId = props.getProperty('TEMPLATE_SHEET_ID') || '';
    var saEmail = props.getProperty('SA_EMAIL') || '';

    var allowedRootIds = allowedRootsStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    // Constant-time key match
    var isUploadKey = secureKeyEqual_(apiKey, keyUpload);
    var isAdminKey = secureKeyEqual_(apiKey, keyAdmin);

    // Rate limiting (60 req/min) - berlaku untuk kunci valid maupun salah
    var rateLimitId = apiKey ? (isUploadKey ? 'upload_key' : (isAdminKey ? 'admin_key' : 'invalid_' + apiKey.substring(0, 10))) : 'anonymous';
    if (!checkRateLimit_(rateLimitId)) {
      Logger.log('[RATE_LIMIT] Action: ' + action + ' exceeded limit');
      return jsonResponse_({ success: false, status: 429, error: 'Server sedang sibuk. Coba lagi sebentar.' });
    }

    // Fail closed: jika bukan kunci valid sama sekali
    if (!isUploadKey && !isAdminKey) {
      Logger.log('[AUTH_FAIL] Invalid API key for action: ' + action);
      return jsonResponse_({ success: false, status: 401, error: 'Konfigurasi server tidak valid.' });
    }

    // Action Router
    if (action === 'ping') {
      Logger.log('[PING] Success from ' + (isAdminKey ? 'admin' : 'upload'));
      return jsonResponse_({
        success: true,
        data: {
          version: '2',
          time: new Date().toISOString()
        }
      });
    }

    if (action === 'createBranchStructure') {
      if (!isAdminKey) {
        Logger.log('[FORBIDDEN] createBranchStructure called without admin key');
        return jsonResponse_({ success: false, status: 403, error: 'Akses ditolak: createBranchStructure membutuhkan kunci admin.' });
      }
      return handleCreateBranchStructure_(payload, allowedRootIds, templateSheetId, saEmail);
    }

    if (action === 'uploadPhoto') {
      if (!isUploadKey) {
        Logger.log('[FORBIDDEN] uploadPhoto called without upload key');
        return jsonResponse_({ success: false, status: 403, error: 'Akses ditolak: uploadPhoto membutuhkan kunci upload.' });
      }
      return handleUploadPhoto_(payload, allowedRootIds);
    }

    if (action === 'revokePublicWrite') {
      if (!isAdminKey) {
        Logger.log('[FORBIDDEN] revokePublicWrite called without admin key');
        return jsonResponse_({ success: false, status: 403, error: 'Akses ditolak: revokePublicWrite membutuhkan kunci admin.' });
      }
      return handleRevokePublicWrite_(payload, allowedRootIds);
    }

    return jsonResponse_({ success: false, status: 400, error: 'Action tidak dikenali: ' + action });

  } catch (err) {
    Logger.log('[ERROR] Unhandled exception: ' + (err.message || err));
    return jsonResponse_({ success: false, status: 502, error: 'Foto gagal disimpan. Coba lagi.' });
  }
}

/**
 * Buat struktur folder & spreadsheet cabang secara idempotent.
 */
function handleCreateBranchStructure_(payload, allowedRootIds, templateSheetId, saEmail) {
  var branchCode = (payload.branchCode || '').trim();
  var branchName = (payload.branchName || '').trim();

  // Validasi branchCode ^[A-Z0-9-]{2,20}$
  if (!/^[A-Z0-9-]{2,20}$/.test(branchCode)) {
    return jsonResponse_({ success: false, status: 400, error: 'Kode cabang tidak valid.' });
  }

  // Validasi branchName <= 120 char, tanpa karakter kontrol
  if (!branchName || branchName.length > 120 || /[\x00-\x1F\x7F]/.test(branchName)) {
    return jsonResponse_({ success: false, status: 400, error: 'Nama cabang tidak valid.' });
  }

  if (allowedRootIds.length === 0) {
    return jsonResponse_({ success: false, status: 500, error: 'ALLOWED_ROOT_IDS belum dikonfigurasi.' });
  }

  var rootFolder = DriveApp.getFolderById(allowedRootIds[0]);

  // Cek apakah folder cabang sudah ada (idempotency check)
  var existingFolder = null;
  var subfolders = rootFolder.getFolders();
  var folderPrefix = branchCode + ' - ';
  while (subfolders.hasNext()) {
    var f = subfolders.next();
    var desc = f.getDescription() || '';
    if (desc.indexOf('mycheck_branch=' + branchCode) !== -1 || f.getName().indexOf(folderPrefix) === 0) {
      existingFolder = f;
      break;
    }
  }

  var branchFolder;
  var spreadsheetFile = null;
  var reused = false;

  if (existingFolder) {
    branchFolder = existingFolder;
    reused = true;

    // Cari spreadsheet di dalam folder cabang
    var files = branchFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    if (files.hasNext()) {
      spreadsheetFile = files.next();
    }
  } else {
    var newFolderName = branchCode + ' - ' + branchName;
    branchFolder = rootFolder.createFolder(newFolderName);
    branchFolder.setDescription('mycheck_branch=' + branchCode);
  }

  // Buat atau cari Spreadsheet cabang dari template bila belum ada
  if (!spreadsheetFile) {
    if (!templateSheetId) {
      return jsonResponse_({ success: false, status: 500, error: 'TEMPLATE_SHEET_ID belum dikonfigurasi.' });
    }
    var template = DriveApp.getFileById(templateSheetId);
    var copyName = branchCode + ' - ' + branchName;
    spreadsheetFile = template.makeCopy(copyName, branchFolder);
    spreadsheetFile.setDescription('mycheck_branch=' + branchCode);

    if (saEmail) {
      try {
        spreadsheetFile.addEditor(saEmail);
      } catch (saErr) {
        Logger.log('[WARN] Failed to add editor SA_EMAIL: ' + saErr.message);
      }
    }
  }

  // Subfolder Evidence di dalam folder cabang
  var evidenceFolder = null;
  var evFolders = branchFolder.getFoldersByName('Evidence');
  if (evFolders.hasNext()) {
    evidenceFolder = evFolders.next();
  } else {
    evidenceFolder = branchFolder.createFolder('Evidence');
  }

  Logger.log('[BRANCH_SUCCESS] Code=' + branchCode + ' Reused=' + reused);
  return jsonResponse_({
    success: true,
    data: {
      branchFolderId: branchFolder.getId(),
      spreadsheetId: spreadsheetFile.getId(),
      evidenceFolderId: evidenceFolder.getId(),
      reused: reused
    }
  });
}

/**
 * Simpan foto ke folder evidence di bawah Script Lock.
 */
function handleUploadPhoto_(payload, allowedRootIds) {
  var folderId = payload.folderId;
  var baseName = payload.baseName;
  var mimeType = payload.mimeType;
  var fileBase64 = payload.fileBase64;

  if (!folderId || !baseName || !mimeType || !fileBase64) {
    return jsonResponse_({ success: false, status: 400, error: 'Payload upload tidak lengkap.' });
  }

  // MIME allowlist
  var allowedMimes = ['image/webp', 'image/png', 'image/jpeg'];
  if (allowedMimes.indexOf(mimeType) === -1) {
    return jsonResponse_({ success: false, status: 400, error: 'Format foto yang didukung: WebP, PNG, JPEG.' });
  }

  // BaseName regex validation
  var baseNameRegex = /^[A-Z0-9][A-Z0-9-]{0,40}-\d{8}-[a-z]+-[a-z0-9._-]{1,30}$/;
  if (!baseNameRegex.test(baseName)) {
    return jsonResponse_({ success: false, status: 400, error: 'Nama berkas tidak valid.' });
  }

  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (fErr) {
    return jsonResponse_({ success: false, status: 502, error: 'Folder penyimpanan tidak dikenali.' });
  }

  // Ancestor check up to 6 levels
  if (!isUnderAllowedRoot_(folder, allowedRootIds)) {
    Logger.log('[SECURITY] Attempt to upload outside allowed roots. Folder: ' + folderId);
    return jsonResponse_({ success: false, status: 502, error: 'Folder penyimpanan tidak dikenali.' });
  }

  // Decode bytes & check size limit (<= 5 MB)
  var bytes;
  try {
    bytes = Utilities.base64Decode(fileBase64);
  } catch (decErr) {
    return jsonResponse_({ success: false, status: 400, error: 'Isi berkas base64 rusak.' });
  }

  if (bytes.length > 5 * 1024 * 1024) {
    return jsonResponse_({ success: false, status: 400, error: 'Ukuran foto maksimal 5 MB.' });
  }

  // LockService for atomic file sequence numbering
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(20000);
  } catch (lErr) {
    acquired = false;
  }

  if (!acquired) {
    Logger.log('[LOCK_BUSY] Unable to acquire lock for upload');
    return jsonResponse_({ success: false, status: 503, error: 'Server sedang sibuk. Coba lagi sebentar.' });
  }

  try {
    var max = 0;
    var ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
    var re = new RegExp('^' + escapeRe_(baseName) + '-(\\d+)\\.' + ext + '$');
    var files = folder.getFiles();
    while (files.hasNext()) {
      var item = files.next();
      var m = item.getName().match(re);
      if (m) {
        var num = parseInt(m[1], 10);
        if (num > max) max = num;
      }
    }

    var nextNum = max + 1;
    var fileName = baseName + '-' + nextNum + '.' + ext;
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = folder.createFile(blob);

    // Share per file viewer
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    Logger.log('[UPLOAD_SUCCESS] File: ' + fileName + ' Size: ' + bytes.length);
    return jsonResponse_({
      success: true,
      data: {
        fileId: file.getId(),
        fileUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
        fileName: fileName,
        sizeBytes: bytes.length
      }
    });
  } catch (upErr) {
    Logger.log('[UPLOAD_ERROR] Error creating file: ' + upErr.message);
    if ((upErr.message || '').indexOf('quota') !== -1) {
      return jsonResponse_({ success: false, status: 507, error: 'Penyimpanan foto sedang penuh.' });
    }
    return jsonResponse_({ success: false, status: 502, error: 'Foto gagal disimpan. Coba lagi.' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fase 0 - cabut izin publik pada folder.
 *
 * Service account tidak bisa menghapus permission 'anyone' yang diwarisi
 * (Drive API menolak dengan "cannot delete the permission"). GAS berjalan
 * sebagai owner sehingga aksi ini hanya mungkin dilakukan dari sini.
 *
 * Hanya permission bertipe 'anyone' yang dicabut. Permission user/domain
 * tidak pernah disentuh, jadi akses service account dan owner tetap utuh.
 *
 * payload.folderIds boleh diisi daftar foldercabang. Bila kosong, seluruh
 * ALLOWED_ROOT_IDS diproses. Folder di luar subtree root ditolak.
 */
function handleRevokePublicWrite_(payload, allowedRootIds) {
  if (allowedRootIds.length === 0) {
    return jsonResponse_({ success: false, status: 500, error: 'ALLOWED_ROOT_IDS belum dikonfigurasi.' });
  }

  var requested = payload.folderIds;
  var targets = [];

  if (requested && requested.length > 0) {
    if (!(requested instanceof Array)) {
      return jsonResponse_({ success: false, status: 400, error: 'folderIds harus berupa array.' });
    }
    targets = requested.slice(0, 50);
  } else {
    targets = allowedRootIds.slice();
  }

  var results = [];

  for (var i = 0; i < targets.length; i++) {
    var folderId = String(targets[i] || '').trim();
    if (!folderId) continue;

    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (fErr) {
      results.push({ folderId: folderId, name: null, error: 'Folder tidak ditemukan atau bukan folder.' });
      continue;
    }

    // Folder target harus root itu sendiri atau turunan dari root yang diizinkan.
    var permitted = allowedRootIds.indexOf(folderId) !== -1 || isUnderAllowedRoot_(folder, allowedRootIds);
    if (!permitted) {
      Logger.log('[SECURITY] revokePublicWrite ditolak untuk folder di luar root: ' + folderId);
      results.push({ folderId: folderId, name: folder.getName(), error: 'Di luar subtree root yang diizinkan.' });
      continue;
    }

    var revoked = 0;
    var failed = [];
    var remainingPublic = 0;

    try {
      // Memakai layanan lanjutan Drive v3, bukan DriveApp.getViewers():
      // DriveApp tidak mengekspos permission bertipe 'anyone' secara andal
      // (tidak ada konstanta DriveApp.Domain.ANYONE). Permissions.list
      // mengembalikan type 'anyone' dengan id 'anyoneWithLink'.
      var listRes = Drive.Permissions.list(folderId, {
        fields: 'permissions(id,type,role)'
      });
      var perms = listRes.permissions || [];

      for (var j = 0; j < perms.length; j++) {
        var p = perms[j];
        if (p.type !== 'anyone') continue;
        try {
          Drive.Permissions.remove(folderId, p.id);
          revoked++;
        } catch (rmErr) {
          Logger.log('[REVOKE_FAIL] ' + folderId + ' ' + p.id + ': ' + rmErr.message);
          failed.push(p.id + ': ' + rmErr.message);
        }
      }

      // Verifikasi akhir: baca ulang, jangan percaya hasil penghapusan saja.
      var afterRes = Drive.Permissions.list(folderId, {
        fields: 'permissions(id,type,role)'
      });
      var after = afterRes.permissions || [];
      for (var k2 = 0; k2 < after.length; k2++) {
        if (after[k2].type === 'anyone') remainingPublic++;
      }

      if (revoked > 0) {
        Logger.log('[REVOKE] ' + revoked + ' public permission pada folder: ' + folderId);
      }

      results.push({
        folderId: folderId,
        name: folder.getName(),
        revoked: revoked,
        remainingPublic: remainingPublic,
        failed: failed
      });
    } catch (listErr) {
      Logger.log('[REVOKE_ERROR] ' + folderId + ': ' + listErr.message);
      results.push({ folderId: folderId, name: folder.getName(), error: 'Gagal membaca permission: ' + listErr.message });
    }
  }

  var totalRemaining = 0;
  for (var k = 0; k < results.length; k++) {
    totalRemaining += (results[k].remainingPublic || 0);
  }

  return jsonResponse_({
    success: true,
    data: {
      results: results,
      totalTargets: results.length,
      totalRemainingPublic: totalRemaining
    }
  });
}

/**
 * Ancestor lookup up to 6 levels depth.
 */
function isUnderAllowedRoot_(folder, allowedIds) {
  var current = folder;
  for (var depth = 0; depth < 6; depth++) {
    var parents = current.getParents();
    if (!parents.hasNext()) return false;
    current = parents.next();
    if (allowedIds.indexOf(current.getId()) !== -1) return true;
  }
  return false;
}

/**
 * Escape regex special chars.
 */
function escapeRe_(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Constant-time string comparison.
 */
function secureKeyEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Simple 60 request/minute rate limit per identifier using CacheService.
 */
function checkRateLimit_(keyIdentifier) {
  try {
    var cache = CacheService.getScriptCache();
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, keyIdentifier);
    var hash = '';
    for (var i = 0; i < hashBytes.length; i++) {
      var byteVal = hashBytes[i] < 0 ? hashBytes[i] + 256 : hashBytes[i];
      var hex = byteVal.toString(16);
      hash += hex.length === 1 ? '0' + hex : hex;
    }
    var cacheKey = 'rl_' + hash;
    var current = cache.get(cacheKey);
    var count = current ? parseInt(current, 10) : 0;
    if (count >= 60) {
      return false;
    }
    cache.put(cacheKey, String(count + 1), 60);
    return true;
  } catch (err) {
    // Fail open on cache service error for rate limit
    return true;
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
