import { stat } from 'node:fs/promises';
import path from 'node:path';
import homepage from '../../index.html';
import worker from '../worker/index';

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const distClientDir = path.resolve(process.cwd(), 'dist/client');

/** Serve built static assets from `dist/client` with SPA fallback to `index.html`. */
async function serveBuiltAsset(pathname: string): Promise<Response> {
  let decoded = '/';
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const candidate = path.resolve(distClientDir, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (candidate.startsWith(`${distClientDir}${path.sep}`)) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) {
      return new Response(Bun.file(candidate));
    }
  }

  const spaEntry = path.join(distClientDir, 'index.html');
  if (await Bun.file(spaEntry).exists()) {
    return new Response(Bun.file(spaEntry));
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
