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
