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
    obj[key] = value;
  }
  return obj;
}
