/**
 * Parse a buffer as UTF-8 text.
 * @param {Buffer} buf
 * @returns {string}
 */
export function parseText(buf) {
  return buf.toString('utf8');
}
