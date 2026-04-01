import { getRequestId } from './utils/request.id.js';
import { HTTP } from './utils/http.status.js';
import { parseCookies } from './utils/header.utils.js';

/**
 * Per-request context wrapping native req/res.
 */
export class Ctx {
  /** @type {import('node:http').IncomingMessage} */
  req;
  /** @type {import('node:http').ServerResponse} */
  res;
  /** @type {Object<string, string>} */
  params = {};
  /** @type {Object<string, any>} */
  state = {};
  /** @type {any} */
  body = undefined;
  /** @type {any} */
  log = undefined;

  /** @type {URL | null} */
  #url = null;
  #sent = false;
  /** @type {string | null} */
  #id = null;
  /** @type {Object<string, string> | null} */
  #cookies = null;
  /** @type {boolean} */
  #trustProxy = false;

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {{ trustProxy?: boolean }} [opts]
   */
  constructor(req, res, opts) {
    this.req = req;
    this.res = res;
    this.#trustProxy = opts?.trustProxy ?? false;
  }

  /** Unique request ID (auto-generated or from X-Request-Id header). */
  get id() {
    if (!this.#id) {
      this.#id = getRequestId(this.req);
    }
    return this.#id;
  }

  /** Client IP address (proxy-aware when trustProxy is enabled). */
  get ip() {
    if (this.#trustProxy) {
      const forwarded = this.req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
      }
    }
    return this.req.socket?.remoteAddress ?? '';
  }

  /** Request protocol (proxy-aware when trustProxy is enabled). */
  get protocol() {
    if (this.#trustProxy) {
      const proto = this.req.headers['x-forwarded-proto'];
      if (typeof proto === 'string') return proto.split(',')[0]?.trim() ?? 'http';
    }
    return /** @type {any} */ (this.req.socket)?.encrypted ? 'https' : 'http';
  }

  /** Request hostname (proxy-aware when trustProxy is enabled). */
  get hostname() {
    if (this.#trustProxy) {
      const host = this.req.headers['x-forwarded-host'];
      if (typeof host === 'string') return host.split(',')[0]?.trim() ?? '';
    }
    const hostHeader = this.req.headers.host ?? '';
    // Strip port
    const colonIdx = hostHeader.lastIndexOf(':');
    return colonIdx > 0 ? hostHeader.slice(0, colonIdx) : hostHeader;
  }

  /** Parsed request cookies (lazy). */
  get cookies() {
    if (!this.#cookies) {
      this.#cookies = parseCookies(/** @type {string} */ (this.req.headers.cookie ?? ''));
    }
    return this.#cookies;
  }

  /**
   * Set a response cookie.
   * @param {string} name
   * @param {string} value
   * @param {Object} [opts]
   * @param {string} [opts.path]
   * @param {string} [opts.domain]
   * @param {number} [opts.maxAge]
   * @param {Date} [opts.expires]
   * @param {boolean} [opts.httpOnly]
   * @param {boolean} [opts.secure]
   * @param {'Strict' | 'Lax' | 'None'} [opts.sameSite]
   */
  setCookie(name, value, opts = {}) {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    if (opts.path) cookie += `; Path=${opts.path}`;
    if (opts.domain) cookie += `; Domain=${opts.domain}`;
    if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
    if (opts.expires) cookie += `; Expires=${opts.expires.toUTCString()}`;
    if (opts.httpOnly) cookie += '; HttpOnly';
    if (opts.secure) cookie += '; Secure';
    if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;

    // Append to existing Set-Cookie headers
    const existing = this.res.getHeader('Set-Cookie');
    if (existing) {
      const arr = Array.isArray(existing) ? existing : [/** @type {string} */ (existing)];
      arr.push(cookie);
      this.res.setHeader('Set-Cookie', arr);
    } else {
      this.res.setHeader('Set-Cookie', cookie);
    }

    return this;
  }

  /** HTTP method (uppercase). */
  get method() {
    return this.req.method;
  }

  /** Parsed URL object. */
  get url() {
    if (!this.#url) {
      this.#url = new URL(this.req.url ?? '/', `http://${this.req.headers.host ?? 'localhost'}`);
    }
    return this.#url;
  }

  /** Pathname string. */
  get path() {
    return this.url.pathname;
  }

  /** Query parameters as a plain object. */
  get query() {
    const obj = Object.create(null);
    for (const [key, value] of this.url.searchParams) {
      obj[key] = value;
    }
    return obj;
  }

  /** Request headers (lower-cased keys). */
  get headers() {
    return this.req.headers;
  }

  /**
   * Set response status code.
   * @param {number} code
   * @returns {this}
   */
  status(code) {
    this.res.statusCode = code;
    return this;
  }

  /**
   * Set a response header.
   * @param {string} key
   * @param {string | number} value
   * @returns {this}
   */
  header(key, value) {
    this.res.setHeader(key, String(value));
    return this;
  }

  /**
   * Send a response. Auto-detects content type.
   * @param {string | Buffer | object} data
   */
  send(data) {
    if (this.#sent) return;
    this.#sent = true;

    if (Buffer.isBuffer(data)) {
      if (!this.res.hasHeader('content-type')) {
        this.res.setHeader('Content-Type', 'application/octet-stream');
      }
      this.res.setHeader('Content-Length', data.length);
      this.res.end(data);
    } else if (typeof data === 'string') {
      if (!this.res.hasHeader('content-type')) {
        this.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      const buf = Buffer.from(data, 'utf8');
      this.res.setHeader('Content-Length', buf.length);
      this.res.end(buf);
    } else if (data !== null && data !== undefined) {
      const json = JSON.stringify(data);
      if (!this.res.hasHeader('content-type')) {
        this.res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      const buf = Buffer.from(json, 'utf8');
      this.res.setHeader('Content-Length', buf.length);
      this.res.end(buf);
    } else {
      this.res.end();
    }
  }

  /** Whether the response has already been sent. */
  get sent() {
    return this.#sent;
  }

  /**
   * Redirect to a URL.
   * @param {string} url
   * @param {number} [code=302]
   */
  redirect(url, code = HTTP.FOUND) {
    this.status(code).header('Location', url);
    this.send('');
  }

  /**
   * Pipe a readable stream to the response.
   * @param {import('node:stream').Readable} readable
   * @param {string} [contentType]
   */
  stream(readable, contentType) {
    if (this.#sent) return;
    this.#sent = true;

    if (contentType) {
      this.res.setHeader('Content-Type', contentType);
    }

    readable.on('error', (err) => {
      this.res.destroy(err);
    });
    readable.pipe(this.res);
  }
}
