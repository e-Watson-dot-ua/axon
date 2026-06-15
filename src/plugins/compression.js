import zlib from 'node:zlib';
import { appendVary } from '../utils/header.utils.js';

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
      // Even uncompressed, the response is negotiated on Accept-Encoding.
      appendVary(ctx.res, 'Accept-Encoding');
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
      const cb = typeof encodingOrCb === 'function' ? encodingOrCb : callback;

      // This response is content-negotiated regardless of the branch taken.
      appendVary(ctx.res, 'Accept-Encoding');

      // Skip compression for too-small, non-compressible, or already-encoded
      // bodies (re-compressing an encoded body would corrupt it).
      const contentType = /** @type {string} */ (ctx.res.getHeader('content-type') ?? '');
      const alreadyEncoded = ctx.res.getHeader('content-encoding');
      if (alreadyEncoded || !COMPRESSIBLE_RE.test(contentType) || body.length < threshold) {
        ctx.res.setHeader('Content-Length', body.length);
        return origEnd(body, cb);
      }

      // Compress asynchronously so a large body never blocks the event loop.
      const compressor = encoding === 'gzip' ? zlib.gzip : zlib.deflate;
      compressor(body, (err, compressed) => {
        if (err) {
          // Compression failed — fall back to the raw body.
          ctx.res.setHeader('Content-Length', body.length);
          origEnd(body, cb);
          return;
        }
        ctx.res.removeHeader('content-length');
        ctx.res.setHeader('Content-Encoding', encoding);
        ctx.res.setHeader('Content-Length', compressed.length);
        origEnd(compressed, cb);
      });
      return ctx.res;
    });

    await next();
  });
}
