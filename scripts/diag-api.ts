// scripts/diag-api.ts — panggil API live dengan sesi admin untuk lihat apa yang dikembalikan.
import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET!;
const PORT = process.env.PORT || '3000';

function mintToken(data: { username: string; nama: string; role: 'admin' | 'petugas'; cabangId: string }): string {
  const payload = { ...data, exp: Date.now() + 3600_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

async function hit(path: string, token: string) {
  const url = `http://localhost:${PORT}${path}`;
  try {
    const res = await fetch(url, { headers: { cookie: `mycheck_session=${token}` } });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
    console.log(`\n=== GET ${path} → ${res.status} ===`);
    const p = parsed as Record<string, unknown>;
    if (p && typeof p === 'object') {
      const arr = (p.entries || p.reports || p.incidents || p.data) as unknown[] | undefined;
      if (Array.isArray(arr)) {
        console.log(`count=${arr.length}`);
        console.log(JSON.stringify(arr.slice(0, 3), null, 2));
      } else {
        console.log(JSON.stringify(p, null, 2).slice(0, 1500));
      }
    } else {
      console.log(String(parsed).slice(0, 500));
    }
  } catch (e) {
    console.log(`\n=== GET ${path} → ERROR ${(e as Error).message} ===`);
  }
}

async function main() {
  // Cari user admin dari Registry lewat login? Kita pakai username 'Taufik' (yang punya shift hari ini).
  const token = mintToken({ username: 'Taufik', nama: 'Taufik', role: 'admin', cabangId: 'CBGBDG01' });
  await hit('/api/handovers?limit=10', token);
  await hit('/api/admin/reports', token);
  await hit('/api/incidents', token);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
