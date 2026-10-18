import { DocsLayout as FumadocsLayout } from 'fumadocs-ui/layouts/docs';
import { ArrowLeft, LogIn } from 'lucide-react';
import { source } from '@/lib/source';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FumadocsLayout
      tree={source.getPageTree()}
      nav={{
        title: <span className="font-semibold tracking-tight">MyCheck Docs</span>,
        url: '/docs',
      }}
      links={[
        { type: 'main', text: 'Kembali ke aplikasi', url: '/', icon: <ArrowLeft className="size-4" /> },
        { type: 'button', text: 'Masuk', url: '/login', icon: <LogIn className="size-4" />, secondary: true },
      ]}
      themeSwitch={{ enabled: false }}
      githubUrl={undefined}
    >
      {children}
    </FumadocsLayout>
  );
}
