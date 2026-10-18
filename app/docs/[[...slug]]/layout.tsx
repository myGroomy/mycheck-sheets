import { DocsLayout as FumadocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FumadocsLayout
      tree={source.getPageTree()}
      nav={{ title: <b>mycheck</b>, url: '/docs' }}
      githubUrl="https://github.com/myGroomy/mycheck-sheets"
    >
      {children}
    </FumadocsLayout>
  );
}
