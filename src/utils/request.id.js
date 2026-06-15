import crypto from 'node:crypto';

/**
 * Safe character set / length for a reused request ID. Rejecting anything else
 * prevents log/header injection and unbounded values from an untrusted client.
 */
const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Generate or reuse a request ID.
 * If the incoming request has a valid X-Request-Id header, reuse it.
 * Otherwise generate a new UUID.
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
export function getRequestId(req) {
  const existing = req.headers['x-request-id'];
  if (typeof existing === 'string' && SAFE_ID_RE.test(existing)) {
    return existing;
  }
  return crypto.randomUUID();
}
