/**
 * Access-log middleware — emits one structured line per request once the
 * response is finished. Status >= 500 logs at `error`, >= 400 at `warn`.
 *
 * @param {Object} [opts]
 * @param {any} [opts.logger] logger to use; defaults to the request logger (`ctx.log`)
 * @returns {import('../types.js').MiddlewareFn}
 */
export function accessLog(opts = {}) {
  return async function accessLogMiddleware(ctx, next) {
    const start = performance.now();
    try {
      await next();
    } finally {
      const log = opts.logger ?? ctx.log;
      if (log) {
        const ms = Number((performance.now() - start).toFixed(1));
        const status = ctx.res.statusCode;
        const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
        log[level]?.('request', { method: ctx.method, path: ctx.path, status, ms });
      }
    }
  };
}
