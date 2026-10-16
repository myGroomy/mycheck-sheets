// lib/google/gas-client.ts
// Klien HTTP untuk Google Apps Script (GAS) Web App endpoint.

export class GasError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'GasError';
    this.statusCode = statusCode;
  }
}

export class GasConfigError extends GasError {
  constructor(message = 'Layanan Google Apps Script belum dikonfigurasi.') {
    super(message, 503);
    this.name = 'GasConfigError';
  }
}

export class GasTimeoutError extends GasError {
  constructor(message = 'Batas waktu panggilan Google Apps Script terlampaui.') {
    super(message, 504);
    this.name = 'GasTimeoutError';
  }
}

export function isGasConfigured(keyKind: 'upload' | 'admin' = 'upload'): boolean {
  const url = process.env.MYCHECK_GAS_URL;
  const key =
    keyKind === 'admin'
      ? process.env.MYCHECK_GAS_ADMIN_KEY
      : process.env.MYCHECK_GAS_UPLOAD_KEY;
  return Boolean(url && key);
}

export async function callGas<T = unknown>(
  action: string,
  payload: unknown,
  keyKind: 'upload' | 'admin',
  timeoutMs = 25000
): Promise<T> {
  const url = process.env.MYCHECK_GAS_URL;
  const key =
    keyKind === 'admin'
      ? process.env.MYCHECK_GAS_ADMIN_KEY
      : process.env.MYCHECK_GAS_UPLOAD_KEY;

  if (!url || !key) {
    throw new GasConfigError(
      `Konfigurasi GAS belum lengkap (${!url ? 'MYCHECK_GAS_URL' : keyKind === 'admin' ? 'MYCHECK_GAS_ADMIN_KEY' : 'MYCHECK_GAS_UPLOAD_KEY'} belum diset).`
    );
  }

  const body = JSON.stringify({
    action,
    'x-api-key': key,
    payload,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new GasTimeoutError();
    }
    throw new GasError(
      `Gagal menghubungi layanan GAS: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }

  let text = '';
  try {
    text = await response.text();
  } catch {
    throw new GasError('Gagal membaca respons dari GAS.', 502);
  }

  let parsed: {
    success?: boolean;
    status?: number;
    error?: string;
    data?: unknown;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    // Respons bukan JSON (misal halaman error Google HTML 500 / 404 / 405)
    if (!response.ok) {
      if (response.status === 405) {
        throw new GasError('Endpoint GAS menolak metode POST (HTTP 405). Pastikan deployment diatur sebagai Web App.', 502);
      }
      throw new GasError(`Layanan GAS mengembalikan status ${response.status}.`, 502);
    }
    throw new GasError('Respons dari GAS bukan JSON yang valid.', 502);
  }

  if (!parsed.success) {
    const status = parsed.status ?? (response.ok ? 502 : response.status);
    const message = parsed.error || 'Operasi GAS gagal.';
    throw new GasError(message, status);
  }

  return parsed.data as T;
}
