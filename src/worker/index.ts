import { Hono } from 'hono';
import { handleApiRequest } from '../server/api';
import { type WaitUntilContext, WorkerWeatherCache } from './cache';

const app = new Hono<{ Bindings: Env }>();

app.all('/api/*', async (c) => {
  let ctx: WaitUntilContext | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    // Allow calling app.fetch() directly outside the Workers runtime (e.g. unit tests)
  }

  const cache = new WorkerWeatherCache(ctx);
  const response = await handleApiRequest(c.req.raw, cache);
  if (response) {
    return response;
  }
  return c.json({ error: `Unknown endpoint: ${new URL(c.req.url).pathname}` }, 404);
});

export default app;
