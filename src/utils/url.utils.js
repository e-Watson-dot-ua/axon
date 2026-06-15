/**
 * Convert URLSearchParams to a plain object.
 * For duplicate keys, the last value wins.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Object<string, string>}
 */
export function parseQuery(searchParams) {
  const obj = Object.create(null);
  for (const [key, value] of searchParams) {
    // Skip dangerous keys so a spread/merge of this object cannot pollute a prototype.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    obj[key] = value;
  }
  return obj;
}
