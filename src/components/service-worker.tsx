'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker, which is what makes the app installable.
 *
 * Production only. In development Next's hot reload and the worker's asset
 * cache fight each other, and you end up debugging a stale bundle instead of
 * your code. To try the install flow locally, run a real build:
 *
 *   npm run build && npm start
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // Registration failing must never break the app — it only costs
        // installability and the offline page.
        console.error('Service worker registration failed:', error);
      });
    };

    // Wait for load so registration never competes with the first render.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
