import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ctx } from '../src/context.js';
import { HTTP } from '../src/utils/http.status.js';

/**
 * Creates a minimal mock req/res pair.
 * @param {Object} [opts]
 * @param {string} [opts.method]
 * @param {string} [opts.url]
 * @param {Object<string, string>} [opts.headers]
 */
function createMock(opts = {}) {
  const req = {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/',
    headers: { host: 'localhost', ...(opts.headers ?? {}) },
  };

  const _headers = {};
  let _ended = false;
  let _body = '';
  let _statusCode = HTTP.OK;

  const res = {
    get statusCode() { return _statusCode; },
    set statusCode(v) { _statusCode = v; },
    setHeader(k, v) { _headers[k.toLowerCase()] = v; },
    getHeader(k) { return _headers[k.toLowerCase()]; },
    hasHeader(k) { return k.toLowerCase() in _headers; },
    end(chunk) {
      if (chunk) _body += chunk.toString();
      _ended = true;
    },
    get _internal() { return { headers: _headers, ended: _ended, body: _body }; },
  };

  return { req, res };
}

describe('Ctx', () => {
  it('should expose method, path, and headers', () => {
    const { req, res } = createMock({ method: 'POST', url: '/users?page=2' });
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    assert.equal(ctx.method, 'POST');
    assert.equal(ctx.path, '/users');
    assert.equal(ctx.headers.host, 'localhost');
  });

  it('should parse query params', () => {
    const { req, res } = createMock({ url: '/search?q=axon&limit=10' });
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    assert.equal(ctx.query.q, 'axon');
    assert.equal(ctx.query.limit, '10');
  });

  it('should set status and headers via chaining', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    const ret = ctx.status(HTTP.CREATED).header('X-Custom', 'hello');
    assert.equal(ret, ctx);
    assert.equal(res.statusCode, HTTP.CREATED);
    assert.equal(res._internal.headers['x-custom'], 'hello');
  });

  it('should send JSON for objects', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    ctx.send({ ok: true });

    assert.equal(res._internal.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(res._internal.body, '{"ok":true}');
    assert.ok(res._internal.ended);
  });

  it('should send plain text for strings', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    ctx.send('hello');

    assert.equal(res._internal.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(res._internal.body, 'hello');
  });

  it('should send octet-stream for buffers', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    ctx.send(Buffer.from('raw'));

    assert.equal(res._internal.headers['content-type'], 'application/octet-stream');
  });

  it('should ignore second send() call', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    ctx.send('first');
    ctx.send('second');

    assert.equal(res._internal.body, 'first');
    assert.equal(ctx.sent, true);
  });

  it('should redirect with 302 by default', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    ctx.redirect('/login');

    assert.equal(res.statusCode, HTTP.FOUND);
    assert.equal(res._internal.headers['location'], '/login');
  });

  it('should expose mutable params and state', () => {
    const { req, res } = createMock();
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    ctx.params = { id: '42' };
    ctx.state.user = 'alice';

    assert.equal(ctx.params.id, '42');
    assert.equal(ctx.state.user, 'alice');
  });

  it('should default to / when req.url is undefined', () => {
    const { req, res } = createMock({ url: undefined });
    const ctx = new Ctx(/** @type {any} */ (req), /** @type {any} */ (res));

    assert.equal(ctx.path, '/');
  });
});
