import { cookies } from 'next/headers';
import { DocsLayout as FumadocsLayout } from 'fumadocs-ui/layouts/docs';
import { ArrowLeft } from 'lucide-react';
import { source } from '@/lib/source';
import { prunePageTree } from '@/lib/docs-role';
import { verifySessionToken } from '@/lib/session';

// Panduan (/docs) user-only: dijamin oleh proxy.ts (redirect ke /login),
// jadi layout ini tidak memerlukan tombol "Masuk".
// Pohon sidebar difilter per role: petugas hanya melihat folder `petugas`,
// admin melihat `admin` + `developer`.

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('mycheck_session')?.value;
  const session = token ? verifySessionToken(token) : null;
  const tree = prunePageTree(source.getPageTree(), session?.role);

  return (
    <FumadocsLayout
      tree={tree}
      nav={{
        title: <span className="font-semibold tracking-tight">MyCheck Docs</span>,
        url: '/docs',
      }}
      links={[
        { type: 'main', text: 'Kembali ke aplikasi', url: '/', icon: <ArrowLeft className="size-4" /> },
      ]}
      themeSwitch={{ enabled: false }}
      githubUrl={undefined}
    >
      {children}
    </FumadocsLayout>
  );
}
