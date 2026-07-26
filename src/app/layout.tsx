import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WyDawka',
  description: 'Domowa apteczka — home medicine cabinet',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app is used one-handed at a cupboard; stop iOS-style zoom-on-focus
  // jitter without disabling pinch zoom entirely.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
