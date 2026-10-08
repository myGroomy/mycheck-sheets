import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { PwaStatus } from '@/components/pwa-status';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${plusJakartaSans.variable} bg-canvas text-ink antialiased`}>
        <PwaStatus />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
