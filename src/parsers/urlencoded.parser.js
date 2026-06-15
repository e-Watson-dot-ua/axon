/**
 * Parse a URL-encoded buffer into a plain object.
 * @param {Buffer} buf
 * @returns {Object<string, string>}
 */
export function parseUrlencoded(buf) {
  const params = new URLSearchParams(buf.toString('utf8'));
  const obj = Object.create(null);
  for (const [key, value] of params) {
    // Skip dangerous keys so a spread/merge of this object cannot pollute a prototype.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    obj[key] = value;
  }
  return obj;
}
