import { HttpError } from '../errors/http.error.js';

/**
 * Parse a buffer as JSON.
 * @param {Buffer} buf
 * @returns {any}
 */
export function parseJson(buf) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
