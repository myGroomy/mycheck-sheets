/**
 * SetKey.gs - Helper untuk inisialisasi dan rotasi kunci API di Script Properties.
 * Jalankan fungsi setupKeys() sekali dari editor Apps Script.
 */

function generateHexKey_(length) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + '-' + Date.now() + '-' + Math.random()
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var s = b.toString(16);
    if (s.length === 1) hex += '0';
    hex += s;
  }
  return hex.substring(0, length || 32);
}

function setupKeys() {
  var uploadKey = 'up_' + generateHexKey_(32);
  var adminKey = 'adm_' + generateHexKey_(32);

  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    KEY_UPLOAD: uploadKey,
    KEY_ADMIN: adminKey
  });

  Logger.log('=== KUNCI BERHASIL DIBUAT DAN DISIMPAN ===');
  Logger.log('MYCHECK_GAS_UPLOAD_KEY = ' + uploadKey);
  Logger.log('MYCHECK_GAS_ADMIN_KEY  = ' + adminKey);
  Logger.log('Salin nilai di atas ke environment server (.env) MyCheck.');
}
