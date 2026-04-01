import { collectBody } from '../utils/stream.utils.js';
import { parseJson } from './json.parser.js';
import { parseText } from './text.parser.js';
import { parseUrlencoded } from './urlencoded.parser.js';

/**
 * Parse the request body based on Content-Type.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {Object} [opts]
 * @param {number} [opts.limit] — max body size in bytes
 * @returns {Promise<any>}
 */
export async function parseBody(req, opts = {}) {
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();
  const buf = await collectBody(req, opts);

  if (buf.length === 0) return undefined;

  if (contentType.includes('application/json')) {
    return parseJson(buf);
  }

  if (contentType.includes('text/plain') || contentType.includes('text/html')) {
    return parseText(buf);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return parseUrlencoded(buf);
  }

  // Fallback: raw buffer
  return buf;
}
