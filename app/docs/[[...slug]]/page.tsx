import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { DocsBody, DocsPage } from 'fumadocs-ui/page';
import { source } from '@/lib/source';
import { isDocsAllowed } from '@/lib/docs-role';
import { verifySessionToken } from '@/lib/session';

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = source.getPage(slug);

  if (!page) return {};

  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('mycheck_session')?.value;
  const session = token ? verifySessionToken(token) : null;

  const page = source.getPage(slug);

  // Bukan halaman untuk role ini → 404 (petugas melihat konten admin seperti
  // halaman yang tidak ada, bukan halaman terbuka).
  if (!page || !isDocsAllowed(page.path, session?.role)) notFound();

  const { body: MDX, toc } = page.data;

  return (
    <DocsPage toc={toc}>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}
