import zlib from 'node:zlib';

const COMPRESSIBLE_RE = /^text\/|\/json|\/javascript|\/xml|\+xml|\+json/;

/**
 * Compression plugin using node:zlib.
 * Negotiates via Accept-Encoding header (gzip, deflate).
 *
 * @param {import('../app.js').Axon} app
 * @param {Object} [opts]
 * @param {number} [opts.threshold] min bytes to compress (default: 1024)
 */
export function compression(app, opts = {}) {
  const threshold = opts.threshold ?? 1024;

  app.use(async (ctx, next) => {
    const accept = /** @type {string} */ (ctx.req.headers['accept-encoding'] ?? '');

    /** @type {'gzip' | 'deflate' | null} */
    let encoding = null;
    if (accept.includes('gzip')) encoding = 'gzip';
    else if (accept.includes('deflate')) encoding = 'deflate';

    if (!encoding) {
      await next();
      return;
    }

    // Intercept res.write/end to buffer the response body
    const origEnd = ctx.res.end.bind(ctx.res);

    /** @type {Buffer[]} */
    const chunks = [];

    ctx.res.write = /** @type {any} */ (function (chunk, encodingOrCb, callback) {
      if (typeof chunk === 'string') chunk = Buffer.from(chunk, typeof encodingOrCb === 'string' ? encodingOrCb : 'utf8');
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      if (typeof encodingOrCb === 'function') encodingOrCb();
      else if (typeof callback === 'function') callback();
      return true;
    });

    ctx.res.end = /** @type {any} */ (function (chunk, encodingOrCb, callback) {
      if (chunk) {
        if (typeof chunk === 'string') chunk = Buffer.from(chunk, typeof encodingOrCb === 'string' ? encodingOrCb : 'utf8');
        if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      }

      const body = Buffer.concat(chunks);

      // Check if compressible
      const contentType = /** @type {string} */ (ctx.res.getHeader('content-type') ?? '');
      if (!COMPRESSIBLE_RE.test(contentType) || body.length < threshold) {
        // Not compressible or too small — send raw
        ctx.res.setHeader('Content-Length', body.length);
        return origEnd(body, typeof encodingOrCb === 'function' ? encodingOrCb : callback);
      }

      const compressor = encoding === 'gzip' ? zlib.gzipSync : zlib.deflateSync;
      const compressed = compressor(body);

      ctx.res.removeHeader('content-length');
      ctx.res.setHeader('Content-Encoding', encoding);
      ctx.res.setHeader('Content-Length', compressed.length);
      ctx.res.setHeader('Vary', 'Accept-Encoding');
      return origEnd(compressed, typeof encodingOrCb === 'function' ? encodingOrCb : callback);
    });

    await next();
  });
}
