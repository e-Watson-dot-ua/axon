/**
 * CORS plugin.
 *
 * @param {import('../app.js').Axon} app
 * @param {Object} [opts]
 * @param {string | string[] | ((origin: string) => boolean)} [opts.origin] default: '*'
 * @param {string | string[]} [opts.methods] default: 'GET,HEAD,PUT,PATCH,POST,DELETE'
 * @param {string | string[]} [opts.allowHeaders]
 * @param {string | string[]} [opts.exposeHeaders]
 * @param {number} [opts.maxAge]
 * @param {boolean} [opts.credentials]
 */
export function cors(app, opts = {}) {
  const origin = opts.origin ?? '*';
  const methods = Array.isArray(opts.methods)
    ? opts.methods.join(',')
    : (opts.methods ?? 'GET,HEAD,PUT,PATCH,POST,DELETE');
  const allowHeaders = Array.isArray(opts.allowHeaders)
    ? opts.allowHeaders.join(',')
    : opts.allowHeaders;
  const exposeHeaders = Array.isArray(opts.exposeHeaders)
    ? opts.exposeHeaders.join(',')
    : opts.exposeHeaders;

  /**
   * Resolve the origin value for a given request origin.
   * @param {string} requestOrigin
   * @returns {string}
   */
  function resolveOrigin(requestOrigin) {
    if (origin === '*') return '*';
    if (typeof origin === 'function') {
      return origin(requestOrigin) ? requestOrigin : '';
    }
    if (Array.isArray(origin)) {
      return origin.includes(requestOrigin) ? requestOrigin : '';
    }
    return origin;
  }

  app.addHook('onRequest', async (ctx) => {
    const requestOrigin = /** @type {string} */ (ctx.headers.origin ?? '');
    const resolved = resolveOrigin(requestOrigin);

    if (!resolved) return;

    ctx.header('Access-Control-Allow-Origin', resolved);

    if (opts.credentials) {
      ctx.header('Access-Control-Allow-Credentials', 'true');
    }
    if (exposeHeaders) {
      ctx.header('Access-Control-Expose-Headers', exposeHeaders);
    }

    // Preflight
    if (ctx.method === 'OPTIONS') {
      ctx.header('Access-Control-Allow-Methods', methods);
      if (allowHeaders) {
        ctx.header('Access-Control-Allow-Headers', allowHeaders);
      } else {
        // Reflect requested headers
        const reqHeaders = ctx.headers['access-control-request-headers'];
        if (reqHeaders) {
          ctx.header('Access-Control-Allow-Headers', /** @type {string} */ (reqHeaders));
        }
      }
      if (opts.maxAge !== undefined) {
        ctx.header('Access-Control-Max-Age', String(opts.maxAge));
      }
      ctx.status(204).send('');
    }
  });
}
