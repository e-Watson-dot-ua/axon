import crypto from 'node:crypto';

/**
 * Generate or reuse a request ID.
 * If the incoming request has an X-Request-Id header, reuse it.
 * Otherwise generate a new UUID.
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
export function getRequestId(req) {
  const existing = req.headers['x-request-id'];
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  return crypto.randomUUID();
}
