import test from 'node:test';
import assert from 'node:assert/strict';

import { addSheet, getSheet } from './helpers/mock-sheets';
import { REGISTRY_SPREADSHEET_ID, seedRegistry } from './helpers/mock-registry';
import { clearSession, installSessionStub, makeRequest, setSession } from './helpers/mock-auth';

installSessionStub();

const USERS_HEADERS = ['User_ID', 'Username', 'PIN', 'Nama', 'Role', 'Cabang_ID', 'Aktif', 'Must_Change_Pin', 'Created_At'];

function seedBootstrap() {
  const workbook = seedRegistry([]);
  addSheet(workbook, 'Users', USERS_HEADERS, [{
    User_ID: 'TSDG8967',
    Username: 'admin',
    PIN: '123456',
    Nama: 'admin',
    Role: 'admin',
    Cabang_ID: '',
    Aktif: 'TRUE',
    Must_Change_Pin: 'YES',
    Created_At: '10/17/2026 20:34:15',
  }], REGISTRY_SPREADSHEET_ID);
  return workbook;
}

test('login admin tanpa cabang meminta setup bootstrap', async () => {
  seedBootstrap();
  const { POST } = await import('../app/api/auth/login/route');
  const response = await POST(makeRequest('POST', 'http://localhost:3000/api/auth/login', { username: 'admin', pin: '123456' }));
  assert.equal(response.status, 200);
  const body = await response.json() as { requiresSetup: boolean; user: { role: string; cabangId: string } };
  assert.equal(body.requiresSetup, true);
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.cabangId, '');
  clearSession();
});

test('setup bootstrap me-rewrite row yang sama dan mematikan flag setup', async () => {
  const workbook = seedBootstrap();
  setSession({ username: 'admin', nama: 'admin', role: 'admin', cabangId: '', userId: 'TSDG8967', requiresSetup: true });
  const { POST } = await import('../app/api/auth/bootstrap-setup/route');
  const response = await POST(makeRequest('POST', 'http://localhost:3000/api/auth/bootstrap-setup', {
    username: 'dea',
    newPin: '778899',
    confirmPin: '778899',
  }));
  assert.equal(response.status, 200);
  const rows = getSheet(workbook, 'Users', REGISTRY_SPREADSHEET_ID)?.values ?? [];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['TSDG8967', 'dea', '778899', 'admin', 'admin', '', 'TRUE', 'FALSE', '10/17/2026 20:34:15']);
  clearSession();
});
