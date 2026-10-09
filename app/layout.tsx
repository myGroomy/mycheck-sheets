import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { PwaStatus } from '@/components/pwa-status';
import { AuthProvider } from '@/lib/AuthContext';
import { CabangProvider } from '@/lib/CabangContext';
import { AuthGuard } from '@/components/AuthGuard';
import { NavbarClient } from '@/components/NavbarClient';
import { verifySessionToken } from '@/lib/session';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'checklist-shift',
  description: 'PWA untuk SOP shift karyawan F&B',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'checklist-shift',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#292524',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Baca session cookie di server supaya Navbar me-render item sesuai role
  // sejak SSR. Tanpa ini, admin akan melihat navbar petugas sampai hydration.
  const cookieStore = await cookies();
  const token = cookieStore.get('mycheck_session')?.value;
  const session = token ? verifySessionToken(token) : null;
  const initialRole = session?.role === 'admin' ? 'admin' : 'petugas';

  return (
    <html lang="id">
      <body className={`${plusJakartaSans.variable} bg-canvas text-ink antialiased`}>
        <PwaStatus />
        <AuthProvider>
          <CabangProvider>
            <AuthGuard>
              <NavbarClient initialRole={initialRole} />
              {children}
            </AuthGuard>
          </CabangProvider>
        </AuthProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
