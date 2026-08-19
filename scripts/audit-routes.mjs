// Probe every route class WITHOUT a session cookie and see what the proxy does.
// Protected pages must redirect to /login; assets must not.
const BASE = 'http://localhost:3000';

const cases = [
  ['/', 'page', 'protect'],
  ['/products', 'page', 'protect'],
  ['/products/6', 'page', 'protect'],
  ['/products/6/edit', 'page', 'protect'],
  ['/expiring', 'page', 'protect'],
  ['/shopping', 'page', 'protect'],
  ['/shopping/1/receive', 'page', 'protect'],
  ['/stock/new', 'page', 'protect'],
  ['/doses', 'page', 'protect'],
  ['/household', 'page', 'protect'],
  ['/household/1', 'page', 'protect'],
  ['/household/1/edit', 'page', 'protect'],
  ['/household/new', 'page', 'protect'],
  ['/login', 'page', 'allow'],
  ['/parrot-64.png', 'asset', 'allow'],
  ['/parrot-256.png', 'asset', 'allow'],
  ['/icon.png', 'asset', 'allow'],
  ['/favicon.ico', 'asset', 'allow'],
  ['/manifest.webmanifest', 'asset', 'allow'],
  ['/robots.txt', 'asset', 'allow'],
  ['/_next/image?url=%2Fparrot-256.png&w=128&q=75', 'optimizer', 'allow'],
  ['/loginsomething', 'page', 'protect'],
  ['/login-history', 'page', 'protect'],
  ['/login/', 'page', 'allow'],
  ['/nonexistent', 'page', 'protect'],
  ['/sw.js', 'asset', 'allow'],
  ['/products.png', 'asset', 'allow'],
  // PWA assets. Android fetches these without the page's cookies, so any of
  // them being redirected to /login makes the app silently uninstallable.
  ['/offline.html', 'asset', 'allow'],
  ['/icons/icon-192.png', 'asset', 'allow'],
  ['/icons/icon-512.png', 'asset', 'allow'],
  ['/icons/maskable-512.png', 'asset', 'allow'],
  // Box photos are NOT public like the PWA icons — the extensionless path keeps
  // them under the proxy, and the route re-checks the session itself.
  ['/photo/00000000-0000-0000-0000-000000000000', 'page', 'protect'],
  /*
   * The downloads, which were missing from this list entirely — including the
   * one that hands over the whole database and every photograph in it. Each of
   * these re-checks the session itself and answers 404 rather than 401 to a
   * request carrying a cookie that is not valid, so that the endpoint does not
   * confirm it exists to a stranger. What this file checks is the layer in
   * front: that none of them is reachable without a session at all.
   *
   * A guard that is never asserted is one refactor away from not being there,
   * and these are the last four routes in the app that should lose one quietly.
   */
  ['/export/backup', 'download', 'protect'],
  ['/export/stock', 'download', 'protect'],
  ['/export/movements', 'download', 'protect'],
  ['/export/products', 'download', 'protect'],
  // Not a real export. It must still be behind the guard rather than answering
  // 404 to the world, for the same reason /nonexistent is.
  ['/export/nonsense', 'download', 'protect'],
];

let failures = 0;

for (const [path, kind, expectation] of cases) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  const redirectedToLogin =
    (res.status === 307 || res.status === 302 || res.status === 303) && location.includes('/login');

  let verdict;
  if (expectation === 'protect') {
    verdict = redirectedToLogin ? 'OK' : 'LEAK';
  } else {
    // "allow" means the proxy must not bounce it. 404 is fine (file may not exist).
    verdict = redirectedToLogin ? 'BLOCKED' : 'OK';
  }

  if (verdict !== 'OK') failures++;
  console.log(
    `${verdict.padEnd(8)} ${String(res.status).padEnd(4)} ${kind.padEnd(10)} ${path}` +
      (location ? ` -> ${location}` : ''),
  );
}

console.log(failures === 0 ? '\nAll route classes behave correctly.' : `\n${failures} PROBLEM(S)`);
