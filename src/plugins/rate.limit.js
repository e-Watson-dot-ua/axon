import { HttpError } from '../errors/http.error.js';
import { HTTP } from '../utils/http.status.js';

/**
 * In-memory token-bucket rate limiter plugin.
 *
 * @param {import('../app.js').Axon} app
 * @param {Object} [opts]
 * @param {number} [opts.max] max requests per window (default: 100)
 * @param {number} [opts.window] window in ms (default: 60000)
 * @param {(ctx: any) => string} [opts.keyFn] key extractor (default: ctx.ip)
 */
export function rateLimit(app, opts = {}) {
  const max = opts.max ?? 100;
  const window = opts.window ?? 60_000;
  const keyFn = opts.keyFn ?? ((ctx) => ctx.ip);

  /** @type {Map<string, { count: number, resetAt: number }>} */
  const store = new Map();

  // Periodic cleanup
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, window);
  if (cleanup.unref) cleanup.unref();

  app.addHook('onRequest', async (ctx) => {
    const key = keyFn(ctx);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + window };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, max - entry.count);
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    ctx.header('X-RateLimit-Limit', max);
    ctx.header('X-RateLimit-Remaining', remaining);
    ctx.header('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      ctx.header('Retry-After', retryAfter);
      throw new HttpError(HTTP.TOO_MANY_REQUESTS, 'Too Many Requests');
    }
  });
}
