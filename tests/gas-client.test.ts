// tests/gas-client.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callGas,
  GasError,
  GasConfigError,
  GasTimeoutError,
  isGasConfigured,
} from '../lib/google/gas-client';
import { isFullyRevoked } from '../lib/google/drive-permission-gas';

test('isGasConfigured: mendeteksi ketersediaan env', () => {
  const origUrl = process.env.MYCHECK_GAS_URL;
  const origUpKey = process.env.MYCHECK_GAS_UPLOAD_KEY;
  const origAdmKey = process.env.MYCHECK_GAS_ADMIN_KEY;

  try {
    delete process.env.MYCHECK_GAS_URL;
    delete process.env.MYCHECK_GAS_UPLOAD_KEY;
    delete process.env.MYCHECK_GAS_ADMIN_KEY;

    assert.equal(isGasConfigured('upload'), false);
    assert.equal(isGasConfigured('admin'), false);

    process.env.MYCHECK_GAS_URL = 'https://script.google.com/macros/s/xyz/exec';
    process.env.MYCHECK_GAS_UPLOAD_KEY = 'up_testkey123';
    assert.equal(isGasConfigured('upload'), true);
    assert.equal(isGasConfigured('admin'), false);

    process.env.MYCHECK_GAS_ADMIN_KEY = 'adm_testkey456';
    assert.equal(isGasConfigured('admin'), true);
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_UPLOAD_KEY = origUpKey;
    process.env.MYCHECK_GAS_ADMIN_KEY = origAdmKey;
  }
});

test('callGas: melempar GasConfigError jika env belum diset', async () => {
  const origUrl = process.env.MYCHECK_GAS_URL;
  delete process.env.MYCHECK_GAS_URL;

  try {
    await assert.rejects(
      async () => {
        await callGas('ping', {}, 'upload');
      },
      (err: unknown) => {
        assert.ok(err instanceof GasConfigError);
        assert.equal(err.statusCode, 503);
        assert.ok(err.message.includes('belum lengkap'));
        return true;
      }
    );
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
  }
});

test('callGas: request mengirim header dan body JSON yang tepat', async () => {
  const origUrl = process.env.MYCHECK_GAS_URL;
  const origKey = process.env.MYCHECK_GAS_UPLOAD_KEY;
  const origFetch = globalThis.fetch;

  try {
    process.env.MYCHECK_GAS_URL = 'https://mock.gas/exec';
    process.env.MYCHECK_GAS_UPLOAD_KEY = 'up_secret123';

    let capturedUrl = '';
    let capturedOptions: RequestInit | undefined;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedOptions = init;
      return new Response(
        JSON.stringify({
          success: true,
          data: { ping: 'pong' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const result = await callGas<{ ping: string }>('ping', { foo: 'bar' }, 'upload');
    assert.equal(result.ping, 'pong');
    assert.equal(capturedUrl, 'https://mock.gas/exec');
    assert.equal(capturedOptions?.method, 'POST');
    assert.equal(
      (capturedOptions?.headers as Record<string, string>)?.['Content-Type'],
      'text/plain'
    );

    const bodyObj = JSON.parse(String(capturedOptions?.body));
    assert.equal(bodyObj.action, 'ping');
    assert.equal(bodyObj['x-api-key'], 'up_secret123');
    assert.deepEqual(bodyObj.payload, { foo: 'bar' });
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_UPLOAD_KEY = origKey;
    globalThis.fetch = origFetch;
  }
});

test('callGas: memetakan status error GAS (401/403/429/503/507)', async () => {
  const origUrl = process.env.MYCHECK_GAS_URL;
  const origKey = process.env.MYCHECK_GAS_ADMIN_KEY;
  const origFetch = globalThis.fetch;

  try {
    process.env.MYCHECK_GAS_URL = 'https://mock.gas/exec';
    process.env.MYCHECK_GAS_ADMIN_KEY = 'adm_key';

    // 429 Rate Limit
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: 429,
          error: 'Rate limit exceeded',
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await callGas('ping', {}, 'admin');
      },
      (err: unknown) => {
        assert.ok(err instanceof GasError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.message, 'Rate limit exceeded');
        return true;
      }
    );

    // 507 Quota Full
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: 507,
          error: 'Penyimpanan foto sedang penuh.',
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await callGas('uploadPhoto', {}, 'admin');
      },
      (err: unknown) => {
        assert.ok(err instanceof GasError);
        assert.equal(err.statusCode, 507);
        return true;
      }
    );
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_ADMIN_KEY = origKey;
    globalThis.fetch = origFetch;
  }
});

test('callGas: timeout menghasilkan GasTimeoutError', async () => {
  const origUrl = process.env.MYCHECK_GAS_URL;
  const origKey = process.env.MYCHECK_GAS_UPLOAD_KEY;
  const origFetch = globalThis.fetch;

  try {
    process.env.MYCHECK_GAS_URL = 'https://mock.gas/exec';
    process.env.MYCHECK_GAS_UPLOAD_KEY = 'up_key';

    globalThis.fetch = (async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'TimeoutError';
      throw abortError;
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await callGas('ping', {}, 'upload', 50);
      },
      (err: unknown) => {
        assert.ok(err instanceof GasTimeoutError);
        assert.equal(err.statusCode, 504);
        return true;
      }
    );
  } finally {
    process.env.MYCHECK_GAS_URL = origUrl;
    process.env.MYCHECK_GAS_UPLOAD_KEY = origKey;
    globalThis.fetch = origFetch;
  }
});

test('isFullyRevoked: fail closed pada error atau sisa akses publik', () => {
  assert.equal(
    isFullyRevoked({ results: [{ folderId: 'a', name: 'A', revoked: 1, remainingPublic: 0 }], totalTargets: 1, totalRemainingPublic: 0 }),
    true
  );
  // masih ada akses publik
  assert.equal(
    isFullyRevoked({ results: [{ folderId: 'a', name: 'A', remainingPublic: 1 }], totalTargets: 1, totalRemainingPublic: 1 }),
    false
  );
  // gagal dibaca → anggap belum bersih
  assert.equal(
    isFullyRevoked({ results: [{ folderId: 'a', name: null, error: 'boom' }], totalTargets: 1, totalRemainingPublic: 0 }),
    false
  );
});
