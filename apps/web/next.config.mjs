import path from 'node:path';
import nextEnv from '@next/env';

// Load the single .env at the repo root (local development). forceReload=true is required because
// Next already loaded (and cached) the env of apps/web before reading this file. On a host such as
// Vercel there is no root .env: the variables come from the dashboard and this call changes nothing.
nextEnv.loadEnvConfig(path.resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production', console, true);

const headers = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

export default {
  poweredByHeader: false,
  async headers() { return [{ source: '/:path*', headers }]; },
};
