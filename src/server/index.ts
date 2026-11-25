import homepage from '../client/index.html';
import { handleApiRequest } from './api';
import { WeatherCache } from './cache';

const port = Number(process.env.PORT ?? 3000);
const cache = new WeatherCache(process.env.WEATHER_CACHE_DB ?? '.data/weather-cache.sqlite');

const server = Bun.serve({
  port,
  idleTimeout: 35,
  routes: {
    '/': homepage,
  },
  async fetch(req) {
    const apiResponse = await handleApiRequest(req, cache);
    if (apiResponse) {
      return apiResponse;
    }
    return new Response('Not Found', { status: 404 });
  },
  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
});

console.log(`US Weather Station running at ${server.url}`);
