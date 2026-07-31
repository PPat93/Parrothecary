import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native modules must stay out of the server bundle.
  serverExternalPackages: ['better-sqlite3', '@node-rs/argon2', 'sharp'],
  experimental: {
    serverActions: {
      /*
       * Server Actions cap bodies at 1 MB by default, and a phone photo is
       * 3–5 MB. The upload form shrinks images in the browser before sending,
       * so this is only a safety net for anything that slips past that — a
       * browser without canvas encoding, or an odd format.
       */
      bodySizeLimit: '8mb',
    },
    // TypeScript 7 is the native compiler; Next's build worker cannot yet use
    // its API directly, so let it shell out to the CLI instead. Remove once
    // Next supports TS 7 natively.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
