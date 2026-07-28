import type { MetadataRoute } from 'next';

/**
 * Next serves this at /manifest.webmanifest and links it automatically.
 *
 * The proxy must not gate it: Android fetches the manifest and icons without
 * the page's cookies, so anything redirected to /login makes the app
 * uninstallable. The matcher in proxy.ts already excludes .webmanifest and
 * image extensions for exactly this reason.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Parrothecary',
    short_name: 'Parrothecary',
    description: 'Home medicine and supplement inventory',
    // Standalone drops the browser chrome — which is why the in-app back links
    // matter, since there is no address bar to fall back on.
    display: 'standalone',
    start_url: '/',
    scope: '/',
    orientation: 'portrait',
    background_color: '#0b0c10',
    theme_color: '#0b0c10',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops icons to its own shape; the maskable copy carries a safe
      // zone so the parrot's beak does not get sliced off.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
