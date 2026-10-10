import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { DocsLayout as FumadocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FumadocsLayout
      tree={source.getPageTree()}
      nav={{ title: <b>mycheck</b>, url: '/docs' }}
      githubUrl="https://github.com/myGroomy/mycheck-sheets"
    >
      <Link
        href="/"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali
      </Link>
      {children}
    </FumadocsLayout>
  );
}
