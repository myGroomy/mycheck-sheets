const DEFAULT_TIMEOUT_MS = 5_000;

type RedisResponse<T> = {
  result?: T;
  error?: string;
};

function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function redisUrl(path = ''): string {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  if (!base) throw new Error('UPSTASH_REDIS_REST_URL belum dikonfigurasi');
  return `${base}${path}`;
}

export function isUpstashConfigured(): boolean {
  return redisConfigured();
}

export async function upstashCommand<T>(command: unknown[]): Promise<T> {
  if (!redisConfigured()) throw new Error('Upstash Redis belum dikonfigurasi');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(redisUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = (await response.json()) as RedisResponse<T>;
    if (!response.ok || body.error) throw new Error(body.error ?? `Upstash HTTP ${response.status}`);
    return body.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function upstashPipeline<T>(commands: unknown[][]): Promise<T[]> {
  if (!redisConfigured()) throw new Error('Upstash Redis belum dikonfigurasi');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(redisUrl('/pipeline'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = (await response.json()) as Array<RedisResponse<T>> | RedisResponse<T[]>;
    if (!response.ok) throw new Error(`Upstash HTTP ${response.status}`);
    if (!Array.isArray(body)) {
      if (body.error) throw new Error(body.error);
      return body.result ?? [];
    }
    const failed = body.find((item) => item.error);
    if (failed?.error) throw new Error(failed.error);
    return body.map((item) => item.result as T);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getJson<T>(key: string): Promise<T | null> {
  const value = await upstashCommand<string | null>(['GET', key]);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await upstashCommand(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
}

export async function deleteKeys(...keys: string[]): Promise<void> {
  if (keys.length) await upstashCommand(['DEL', ...keys]);
}

export async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const result = await upstashCommand<[string, string[]]>(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  return keys;
}

export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  return (await upstashCommand<string | null>(['SET', key, '1', 'NX', 'EX', ttlSeconds])) === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await deleteKeys(key);
}
