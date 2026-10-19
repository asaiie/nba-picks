import { onRequest } from './server/api.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // Run before assets or API writes: Secure cookies cannot work over HTTP.
    if (url.protocol === 'http:' && !local) {
      url.protocol = 'https:';
      return new Response(null, { status: 308, headers: { Location: url.href } });
    }
    const original = url.pathname.startsWith('/api/')
      ? await onRequest({ request, env })
      : await env.ASSETS.fetch(request);
    const response = new Response(original.body, original);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    if (!local) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return response;
  }
};
