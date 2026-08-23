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
    /*
     * Maskable first, and offered at both sizes.
     *
     * Android crops icons to its own shape; the maskable copies carry a safe
     * zone so the parrot's beak does not get sliced off. A maskable at 512
     * alone was not enough — Android picks the icon nearest the density it
     * wants, so at 192 it fell back to the "any" icon and drew its own light
     * backdrop behind it. Against near-black artwork that reads as a white ring
     * around the parrot's head.
     *
     * The other half of that fix is in the files themselves: every icon here is
     * now fully opaque. They used to carry alpha around 220 at the edges, and a
     * launcher compositing 86%-opacity black over a light background produces a
     * halo no manifest setting can prevent.
     *
     * Icons are baked into the shortcut when the app is installed. Changing
     * them means removing the app from the home screen and adding it again —
     * a reload will not do it.
     */
    icons: [
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
