// lib/docs-role.ts
// Pemisahan panduan per role: petugas hanya melihat konten folder `petugas`,
// admin melihat `admin` + `developer`. Dipakai halaman/layout docs dan
// endpoint pencarian supaya pembatasan UI juga berlaku untuk URL dan search.

import type { Node, Root } from 'fumadocs-core/page-tree';
import type { UserRole } from '@/lib/nav-config';

// Folder konten per role. Untuk data source, hanya folder di daftar ini yang ditempatkan di akar konten docs.
const ALLOWED_DIRS: Record<UserRole, readonly string[]> = {
  petugas: ['petugas'],
  admin: ['admin', 'developer'],
};

/** Segmen folder pertama dari URL (`/docs/admin/x`) atau path file (`admin/x.mdx`). */
export function docsDirOf(path: string): string {
  return path.replace(/^\/docs\/?/, '').replace(/^docs\//, '').split('/')[0] ?? '';
}

/**
 * Apakah sebuah URL path/path file di luar scope role.
 * Role tak dikenal dianggap petugas (scope terkecil).
 */
export function isDocsAllowed(path: string, role: UserRole | undefined): boolean {
  return (ALLOWED_DIRS[role ?? 'petugas']).includes(docsDirOf(path));
}

/** Salinan pohon halaman docs yang hanya berisi isian folder milik role. */
export function prunePageTree(root: Root, role: UserRole | undefined): Root {
  const filterNodes = (nodes: Node[]): Node[] =>
    nodes.reduce<Node[]>((acc, node) => {
      if (node.type === 'page') {
        if (isDocsAllowed(node.url, role)) acc.push(node);
      } else if (node.type === 'folder') {
        const index = node.index && isDocsAllowed(node.index.url, role) ? node.index : undefined;
        const children = filterNodes(node.children);
        if (index || children.length > 0) acc.push({ ...node, index, children });
      } else {
        acc.push(node); // separator tetap
      }
      return acc;
    }, []);
  return { ...root, children: filterNodes(root.children) };
}
