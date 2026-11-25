import { handleApiRequest } from '../server/api';
import { WorkerWeatherCache } from './cache';

export default {
  async fetch(request: Request, _env?: Env, ctx?: ExecutionContext): Promise<Response> {
    const cache = new WorkerWeatherCache(ctx);
    const response = await handleApiRequest(request, cache);
    return (
      response ??
      Response.json(
        { error: 'Unknown endpoint' },
        {
          status: 404,
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
          },
        },
      )
    );
  },
};
