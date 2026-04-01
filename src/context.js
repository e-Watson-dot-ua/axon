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

  /** @type {URL | null} */
  #url = null;
  #sent = false;

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  constructor(req, res) {
    this.req = req;
    this.res = res;
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
  redirect(url, code = 302) {
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
