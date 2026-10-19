import { onRequest } from './server/api.js';
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const response = await onRequest({ request, env });
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    }
    return env.ASSETS.fetch(request);
  }
};
