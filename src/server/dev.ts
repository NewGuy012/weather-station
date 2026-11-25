import { stat } from 'node:fs/promises';
import path from 'node:path';
import homepage from '../../index.html';
import worker from '../worker/index';

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const distClientDir = path.resolve(process.cwd(), 'dist/client');

const PREVIEW_HEADERS: HeadersInit = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Serve built static assets from `dist/client` with SPA fallback to `index.html`. */
async function serveBuiltAsset(pathname: string): Promise<Response> {
  let decoded = '/';
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (decoded.includes('\0')) {
    return new Response('Bad Request', { status: 400 });
  }

  const candidate = path.resolve(distClientDir, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (candidate.startsWith(`${distClientDir}${path.sep}`)) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) {
      return new Response(Bun.file(candidate), { headers: PREVIEW_HEADERS });
    }
  }

  const spaEntry = path.join(distClientDir, 'index.html');
  if (await Bun.file(spaEntry).exists()) {
    return new Response(Bun.file(spaEntry), { headers: PREVIEW_HEADERS });
  }
  return new Response('Missing dist/client build. Run `bun run build` first.', { status: 500 });
}

const server = Bun.serve({
  port,
  idleTimeout: 35,
  routes: isProd
    ? undefined
    : {
        '/': homepage,
      },
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) {
      return worker.fetch(req);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (isProd) {
      return serveBuiltAsset(pathname);
    }
    return new Response('Not Found', { status: 404 });
  },
  development: !isProd && {
    hmr: true,
    console: true,
  },
});

console.log(`US Weather Station (${isProd ? 'preview' : 'dev'}) running at ${server.url}`);
