import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native modules must stay out of the server bundle.
  serverExternalPackages: ['better-sqlite3', '@node-rs/argon2'],
  experimental: {
    // TypeScript 7 is the native compiler; Next's build worker cannot yet use
    // its API directly, so let it shell out to the CLI instead. Remove once
    // Next supports TS 7 natively.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
