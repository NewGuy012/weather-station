import { rm } from 'node:fs/promises';
import path from 'node:path';
import tailwind from 'bun-plugin-tailwind';

const outDir = 'dist/client';

const SECURITY_HEADERS = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
`;

/** Clean stale assets and bundle the client app into `dist/client` for Cloudflare Assets. */
async function buildClient(): Promise<void> {
  await rm(outDir, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: ['index.html'],
    outdir: outDir,
    publicPath: '/',
    minify: true,
    plugins: [tailwind],
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  await Bun.write(path.join(outDir, '_headers'), SECURITY_HEADERS);

  for (const output of result.outputs) {
    const rel = path.relative(process.cwd(), output.path);
    console.log(`${rel} (${(output.size / 1024).toFixed(1)} kB)`);
  }
}

await buildClient();
