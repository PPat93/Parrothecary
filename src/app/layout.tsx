import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parrothecary',
  description: 'Domowa apteczka — home medicine cabinet',
  // Tells Android this is a standalone app rather than a bookmarked page.
  applicationName: 'Parrothecary',
  appleWebApp: { capable: true, title: 'Parrothecary' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app is used one-handed at a cupboard; stop iOS-style zoom-on-focus
  // jitter without disabling pinch zoom entirely.
  maximumScale: 5,
  // Paints the Android status bar to match the app, so an installed
  // Parrothecary does not sit under a stray white strip.
  themeColor: '#0b0c10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
