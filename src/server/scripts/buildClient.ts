import { rm } from 'node:fs/promises';
import path from 'node:path';
import tailwind from 'bun-plugin-tailwind';

const outDir = 'dist/client';

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

  for (const output of result.outputs) {
    const rel = path.relative(process.cwd(), output.path);
    console.log(`${rel} (${(output.size / 1024).toFixed(1)} kB)`);
  }
}

await buildClient();
