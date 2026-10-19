import type { NextRequest } from 'next/server';
import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';
import { isDocsAllowed } from '@/lib/docs-role';
import { getSessionFromRequest } from '@/lib/session';

// Pencarian docs. Berjalan di atas indeks lengkap, tapi hasilnya difilter
// per role: petugas tidak melihat konten admin/developer. Role dari session
// (endpoint ini dijamin proxy hanya untuk pengguna login).

const searchAll = createFromSource(source);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  if (!query) return Response.json([]);

  const raw = url.searchParams.get('limit');
  const parsedLimit = raw === null ? undefined : Number(raw);
  const limit = Number.isInteger(parsedLimit) ? parsedLimit : undefined;
  const results = await searchAll.search(query, { limit });

  const role = getSessionFromRequest(request)?.role;
  return Response.json(results.filter((result) => isDocsAllowed(result.url, role)));
}
