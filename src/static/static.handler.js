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
    // Decode and normalize the path from the wildcard param. Malformed
    // percent-encoding or an embedded null byte is a bad request, not a 500.
    let requestedPath;
    try {
      requestedPath = decodeURIComponent(ctx.params.path ?? '');
    } catch {
      throw new HttpError(HTTP.BAD_REQUEST, 'Bad Request');
    }
    if (requestedPath.includes('\0')) {
      throw new HttpError(HTTP.BAD_REQUEST, 'Bad Request');
    }

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

    // ETag (quoted) from mtime + size
    const etag = `"${crypto
      .createHash('md5')
      .update(`${stat.mtimeMs}-${stat.size}`)
      .digest('hex')}"`;

    ctx.header('Content-Type', getMimeType(resolvedPath));
    ctx.header('Last-Modified', stat.mtime.toUTCString());
    ctx.header('ETag', etag);
    ctx.header('Cache-Control', 'public, max-age=0');
    ctx.header('Accept-Ranges', 'bytes');

    // Conditional request — honor a matching If-None-Match (list / weak / *).
    if (etagMatches(ctx.headers['if-none-match'], etag)) {
      ctx.status(HTTP.NOT_MODIFIED).send('');
      return;
    }

    // Range request — serve a single byte range as 206, or 416 if unsatisfiable.
    const range = parseRange(ctx.headers['range'], stat.size);
    if (range === 'invalid') {
      ctx.header('Content-Range', `bytes */${stat.size}`);
      ctx.status(HTTP.RANGE_NOT_SATISFIABLE).send('');
      return;
    }
    if (range) {
      const { start, end } = range;
      ctx.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      ctx.header('Content-Length', end - start + 1);
      ctx.status(HTTP.PARTIAL_CONTENT);
      ctx.stream(createReadStream(resolvedPath, { start, end }));
      return;
    }

    ctx.header('Content-Length', stat.size);
    ctx.stream(createReadStream(resolvedPath));
  };
}

/**
 * Test an `If-None-Match` header against an ETag. Handles `*`, comma-separated
 * lists, and weak (`W/`) validators per RFC 9110.
 * @param {string | string[] | undefined} header
 * @param {string} etag - the quoted ETag, e.g. `"abc"`
 * @returns {boolean}
 */
function etagMatches(header, etag) {
  if (typeof header !== 'string' || header.length === 0) return false;
  if (header.trim() === '*') return true;
  const strip = (/** @type {string} */ t) => (t.startsWith('W/') ? t.slice(2) : t);
  const target = strip(etag);
  return header.split(',').some((t) => strip(t.trim()) === target);
}

/**
 * Parse a single-range `Range` header.
 * @param {string | string[] | undefined} header
 * @param {number} size - total file size in bytes
 * @returns {{ start: number, end: number } | null | 'invalid'}
 *   range to serve, `null` to serve the whole file, or `'invalid'` (416).
 */
function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // Unsupported / multi-range syntax → ignore Range, serve full body.
  if (!match) return null;

  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return 'invalid';

  let start;
  let end;
  if (startStr === '') {
    // Suffix range: last N bytes.
    const suffix = Number(endStr);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1);
  }

  if (start > end || start >= size) return 'invalid';
  return { start, end };
}
