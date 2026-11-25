import { handleApiRequest } from '../server/api';
import { WorkerWeatherCache } from './cache';

export default {
  async fetch(request: Request, _env?: Env, ctx?: ExecutionContext): Promise<Response> {
    const cache = new WorkerWeatherCache(ctx);
    const response = await handleApiRequest(request, cache);
    return (
      response ??
      Response.json({ error: `Unknown endpoint: ${new URL(request.url).pathname}` }, { status: 404 })
    );
  },
};
