import { HttpError } from '../errors/http.error.js';
import { HTTP } from '../utils/http.status.js';

/**
 * Parse a buffer as JSON.
 * @param {Buffer} buf
 * @returns {any}
 */
export function parseJson(buf) {
  try {
    // Drop `__proto__` keys so a body like {"__proto__":{...}} cannot become a
    // prototype-pollution gadget when downstream code merges the parsed object.
    return JSON.parse(buf.toString('utf8'), (key, value) => {
      if (key === '__proto__') return undefined;
      return value;
    });
  } catch {
    throw new HttpError(HTTP.BAD_REQUEST, 'Invalid JSON');
  }
}
