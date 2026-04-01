/**
 * Security headers plugin.
 * Sets safe default headers on every response.
 *
 * @param {import('../app.js').Axon} app
 * @param {Object} [opts]
 * @param {string | false} [opts.contentTypeOptions] default: 'nosniff'
 * @param {string | false} [opts.frameOptions] default: 'DENY'
 * @param {string | false} [opts.xssProtection] default: '0'
 * @param {string | false} [opts.hsts] default: 'max-age=15552000; includeSubDomains'
 * @param {string | false} [opts.csp] default: "default-src 'self'"
 */
export function securityHeaders(app, opts = {}) {
  const headers = {};

  const cto = opts.contentTypeOptions ?? 'nosniff';
  if (cto !== false) headers['X-Content-Type-Options'] = cto;

  const fo = opts.frameOptions ?? 'DENY';
  if (fo !== false) headers['X-Frame-Options'] = fo;

  const xss = opts.xssProtection ?? '0';
  if (xss !== false) headers['X-XSS-Protection'] = xss;

  const hsts = opts.hsts ?? 'max-age=15552000; includeSubDomains';
  if (hsts !== false) headers['Strict-Transport-Security'] = hsts;

  const csp = opts.csp ?? "default-src 'self'";
  if (csp !== false) headers['Content-Security-Policy'] = csp;

  app.addHook('onRequest', async (ctx) => {
    for (const [key, value] of Object.entries(headers)) {
      ctx.header(key, value);
    }
  });
}
