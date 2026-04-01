import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getMimeType } from './mime.map.js';
import { HttpError } from '../errors/http.error.js';
import { HTTP } from '../utils/http.status.js';

/**
 * Create a static file serving handler.
 *
 * @param {string} rootDir - absolute path to the directory to serve
 * @param {Object} [opts]
 * @param {string} [opts.index] - index file name (default: 'index.html')
 * @returns {(ctx: import('../context.js').Ctx) => Promise<void>}
 */
export function createStaticHandler(rootDir, opts = {}) {
  const root = path.resolve(rootDir);
  const indexFile = opts.index ?? 'index.html';

  return async function staticHandler(ctx) {
    // Decode and normalize the path from the wildcard param
    const requestedPath = decodeURIComponent(ctx.params.path ?? '');

    // Resolve to absolute, then verify it's within root (prevent traversal)
    const filePath = path.resolve(root, requestedPath);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      throw new HttpError(HTTP.FORBIDDEN, 'Forbidden');
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new HttpError(HTTP.NOT_FOUND, 'Not Found');
    }

    // If directory, try index file
    let resolvedPath = filePath;
    if (stat.isDirectory()) {
      resolvedPath = path.join(filePath, indexFile);
      try {
        stat = await fs.stat(resolvedPath);
      } catch {
        throw new HttpError(HTTP.NOT_FOUND, 'Not Found');
      }
    }

    if (!stat.isFile()) {
      throw new HttpError(HTTP.NOT_FOUND, 'Not Found');
    }

    // ETag from mtime + size
    const etag = crypto
      .createHash('md5')
      .update(`${stat.mtimeMs}-${stat.size}`)
      .digest('hex');

    // Check If-None-Match
    if (ctx.headers['if-none-match'] === `"${etag}"`) {
      ctx.status(HTTP.NOT_MODIFIED);
      ctx.send('');
      return;
    }

    ctx.header('Content-Type', getMimeType(resolvedPath));
    ctx.header('Content-Length', stat.size);
    ctx.header('Last-Modified', stat.mtime.toUTCString());
    ctx.header('ETag', `"${etag}"`);
    ctx.header('Cache-Control', 'public, max-age=0');

    ctx.stream(createReadStream(resolvedPath));
  };
}
