/**
 * Parse a Content-Type header into type and parameters.
 * @param {string} header
 * @returns {{ type: string, params: Object<string, string> }}
 */
export function parseContentType(header) {
  const parts = header.split(';').map((s) => s.trim());
  const type = parts[0] ?? '';
  /** @type {Object<string, string>} */
  const params = Object.create(null);

  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq > 0) {
      const key = parts[i].slice(0, eq).trim().toLowerCase();
      const val = parts[i].slice(eq + 1).trim().replace(/^"|"$/g, '');
      params[key] = val;
    }
  }

  return { type: type.toLowerCase(), params };
}

/**
 * Parse a Cookie header into key-value pairs.
 * @param {string} header
 * @returns {Object<string, string>}
 */
export function parseCookies(header) {
  /** @type {Object<string, string>} */
  const cookies = Object.create(null);
  if (!header) return cookies;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const key = pair.slice(0, eq).trim();
      const val = decodeURIComponent(pair.slice(eq + 1).trim());
      cookies[key] = val;
    }
  }

  return cookies;
}
