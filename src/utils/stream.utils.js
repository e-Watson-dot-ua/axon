import { HttpError } from '../errors/http.error.js';

const DEFAULT_LIMIT = 1024 * 1024; // 1 MiB

/**
 * Collect the full body from a readable stream.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {Object} [opts]
 * @param {number} [opts.limit] — max bytes (default 1 MiB)
 * @returns {Promise<Buffer>}
 */
export function collectBody(req, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new HttpError(413, 'Payload Too Large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks, size));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}
