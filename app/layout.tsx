import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Toaster } from '@/components/ui/sonner';
import { PwaStatus } from '@/components/pwa-status';
import { AuthProvider } from '@/lib/AuthContext';
import { CabangProvider } from '@/lib/CabangContext';
import { WorkingBranchProvider } from '@/lib/working-branch';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { PageTransition } from '@/components/PageTransition';
import { AuthTransitionOverlay } from '@/components/AuthTransitionOverlay';
import { GlobalBackButton } from '@/components/GlobalBackButton';
import { verifySessionToken } from '@/lib/session';
import { isMaintenanceMode } from '@/lib/maintenance';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MyCheck',
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
    title: 'MyCheck',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#292524',
  // Android: tanpa ini layout viewport TIDAK menyusut saat soft keyboard
  // muncul — hanya visual viewport. Dialog yang `position: fixed` tetap
  // di-anchor ke layout viewport full-height, sehingga field berada di belakang
  // keyboard. Chrome lalu mencoba scrollIntoView tapi scroll body sudah dikunci
  // Radix (react-remove-scroll), scroll gagal → focus lepas → keyboard tutup
  // sendiri. `resizes-content` membuat layout viewport ikut menyusut, jadi
  // dialog ter-anchor ulang ke area yang benar-benar terlihat.
  interactiveWidget: 'resizes-content',
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

  // "Cabang kerja" admin juga dibaca di server supaya render pertama sudah
  // memillih cabang yang benar. Kalau ini hanya dibaca di client, setiap
  // navigasi akan sempat merender form tanpa cabang lalu menggantinya —
  // terlihat sebagai flicker dan berisiko hydration mismatch.
  const initialWorkingBranch = cookieStore.get('mycheck_working_branch')?.value ?? null;

  // Cek maintenance mode. Admin tetap bisa akses (untuk menonaktifkan).
  const maintenance = await isMaintenanceMode();
  if (maintenance && session?.role !== 'admin') {
    return (
      <html lang="id" suppressHydrationWarning>
        <body className={`${plusJakartaSans.variable} bg-canvas text-ink antialiased`}>
          <RootProvider>
            <GlobalBackButton />
            <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
              <div className="max-w-md text-center">
                <p className="text-2xl font-bold text-ink">Sedang maintenance</p>
                <p className="mt-2 text-sm text-ink-muted">
                  Aplikasi sedang dalam perawatan. Silakan coba lagi nanti.
                </p>
              </div>
            </div>
          </RootProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${plusJakartaSans.variable} bg-canvas text-ink antialiased`}>
        <RootProvider>
          <PwaStatus />
          <AuthProvider>
            <CabangProvider>
              {/* WorkingBranchProvider harus DI DALAM CabangProvider (butuh
                  daftar cabang untuk memvalidasi pilihan) dan AuthProvider
                  (butuh role untuk memutuskan apakah selector ditampilkan).
                  AuthGuard berada di dalam lagi supaya halaman publik tetap
                  bisa merender tanpa provider ini. */}
              <WorkingBranchProvider initialBranchId={initialWorkingBranch}>
                <AuthGuard>
                  <AppShell initialRole={initialRole}>
                    <PageTransition>
                      <GlobalBackButton />
                      {children}
                    </PageTransition>
                  </AppShell>
                </AuthGuard>
                {/* Overlay login/logout.
                  WAJIB di dalam <AuthProvider> (memakai useAuth) tapi di luar
                  <AuthGuard>, karena AuthGuard-lah yang mengarahkan ke
                  /login saat logout — kalau overlay ikut di dalam guard,
                  overlay ikut ter-unmount tepat saat guard mulai redirect
                  dan loader logout tidak akan pernah terlihat.
                  Jangan dipindah ke luar AuthProvider: useAuth() akan
                  melempar "must be used within AuthProvider". */}
                <AuthTransitionOverlay />
              </WorkingBranchProvider>
            </CabangProvider>
          </AuthProvider>
          <Toaster position="top-center" richColors />
        </RootProvider>
      </body>
    </html>
  );
}
