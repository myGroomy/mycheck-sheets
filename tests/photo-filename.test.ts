// tests/photo-filename.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhotoBaseName,
  getShiftTimeSlot,
  isValidPhotoBaseName,
} from '../lib/photo-filename';

test('getShiftTimeSlot: memetakan jam ke lima rentang slot dengan tepat', () => {
  // Malam (00:00 - 05:59)
  assert.equal(getShiftTimeSlot('00:00'), 'malam');
  assert.equal(getShiftTimeSlot('02:30'), 'malam');
  assert.equal(getShiftTimeSlot('05:59'), 'malam');

  // Pagi (06:00 - 10:59)
  assert.equal(getShiftTimeSlot('06:00'), 'pagi');
  assert.equal(getShiftTimeSlot('07:15'), 'pagi');
  assert.equal(getShiftTimeSlot('10:59'), 'pagi');

  // Siang (11:00 - 14:59)
  assert.equal(getShiftTimeSlot('11:00'), 'siang');
  assert.equal(getShiftTimeSlot('12:00'), 'siang');
  assert.equal(getShiftTimeSlot('14:59'), 'siang');

  // Sore (15:00 - 18:59)
  assert.equal(getShiftTimeSlot('15:00'), 'sore');
  assert.equal(getShiftTimeSlot('16:45'), 'sore');
  assert.equal(getShiftTimeSlot('18:59'), 'sore');

  // Malam (19:00 - 23:59)
  assert.equal(getShiftTimeSlot('19:00'), 'malam');
  assert.equal(getShiftTimeSlot('22:00'), 'malam');
  assert.equal(getShiftTimeSlot('23:59'), 'malam');

  // Fallback: jam invalid, kosong, atau format salah
  assert.equal(getShiftTimeSlot(null), 'umum');
  assert.equal(getShiftTimeSlot(''), 'umum');
  assert.equal(getShiftTimeSlot('invalid'), 'umum');
  assert.equal(getShiftTimeSlot('25:00'), 'umum');
});

test('buildPhotoBaseName: format [KODE]-[tgl]-[slot]-[user]', () => {
  const baseName = buildPhotoBaseName({
    branchCode: 'cbg-bdg-01',
    shiftDate: '2026-10-16',
    startTime: '07:00',
    username: 'Dea_Ayu.1',
  });

  assert.equal(baseName, 'CBG-BDG-01-16102026-pagi-dea_ayu.1');
  assert.ok(isValidPhotoBaseName(baseName));
});

test('buildPhotoBaseName: sanitasi dan fallback', () => {
  // Kode kosong -> UMUM, user kosong -> unknown, startTime kosong -> umum
  const fallback = buildPhotoBaseName({
    branchCode: '',
    shiftDate: '16102026',
    startTime: null,
    username: '',
  });
  assert.equal(fallback, 'UMUM-16102026-umum-unknown');
  assert.ok(isValidPhotoBaseName(fallback));

  // Sanitasi karakter aneh
  const sanitized = buildPhotoBaseName({
    branchCode: 'CBG!@#$BDG',
    shiftDate: '2026-12-01',
    startTime: '13:00',
    username: 'User@Test#1!',
  });
  assert.equal(sanitized, 'CBGBDG-01122026-siang-usertest1');
  assert.ok(isValidPhotoBaseName(sanitized));
});

test('isValidPhotoBaseName: menolak nama yang salah bentuk atau ada path traversal', () => {
  assert.equal(isValidPhotoBaseName('../malicious/path'), false);
  assert.equal(isValidPhotoBaseName('CBGBDG-123-pagi-dea'), false); // tanggal bukan 8 digit
  assert.equal(isValidPhotoBaseName('cbg-16102026-pagi-dea'), false); // kode bukan huruf besar
  assert.equal(isValidPhotoBaseName('CBG-16102026-pagi-'), false); // user kosong
  assert.equal(isValidPhotoBaseName('CBG-16102026-PAGI-dea'), false); // slot bukan lowercase [a-z]+
  assert.equal(isValidPhotoBaseName('CBG-16102026-123-dea'), false); // slot bukan [a-z]+
  assert.equal(isValidPhotoBaseName('CBG-16102026-pagi-dea with space'), false); // spasi
  assert.equal(isValidPhotoBaseName(''), false);
});
