import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseJson } from '../src/parsers/json.parser.js';
import { parseUrlencoded } from '../src/parsers/urlencoded.parser.js';
import { validateSchema } from '../src/validation/schema.validator.js';
import { parseCookies, parseContentType, appendVary } from '../src/utils/header.utils.js';
import { getRequestId } from '../src/utils/request.id.js';
import { collectBody } from '../src/utils/stream.utils.js';
import { HTTP } from '../src/utils/http.status.js';
import { createApp, cors, rateLimit } from '../src/index.js';

describe('Prototype pollution defenses', () => {
  it('parseJson drops __proto__ keys', () => {
    const obj = parseJson(Buffer.from('{"__proto__":{"polluted":true},"a":1}'));
    assert.equal(obj.a, 1);
    assert.equal(Object.getPrototypeOf(obj).polluted, undefined);
    assert.equal({}.polluted, undefined);
  });

  it('parseUrlencoded skips __proto__ keys', () => {
    const obj = parseUrlencoded(Buffer.from('__proto__=x&a=1'));
    assert.equal(obj.a, '1');
    assert.equal(Object.prototype.hasOwnProperty.call(obj, '__proto__'), false);
  });
});

describe('Schema validator uses own properties only', () => {
  it('inherited properties do not satisfy required', () => {
    const schema = { type: 'object', properties: {}, required: ['toString'] };
    const result = validateSchema({}, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('toString')));
  });
});

describe('Header parsing robustness', () => {
  it('parseCookies tolerates malformed percent-encoding', () => {
    const cookies = parseCookies('a=100%; b=ok');
    assert.equal(cookies.a, '100%');
    assert.equal(cookies.b, 'ok');
  });

  it('parseContentType tolerates a missing (non-string) header', () => {
    const result = parseContentType(undefined);
    assert.equal(result.type, '');
  });

  it('appendVary appends without clobbering existing values', () => {
    const headers = new Map();
    const res = /** @type {any} */ ({
      getHeader: (k) => headers.get(k.toLowerCase()),
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
    });
    res.setHeader('Vary', 'Origin');
    appendVary(res, 'Accept-Encoding');
    assert.equal(res.getHeader('vary'), 'Origin, Accept-Encoding');
    // Idempotent — does not duplicate.
    appendVary(res, 'Origin');
    assert.equal(res.getHeader('vary'), 'Origin, Accept-Encoding');
  });
});

describe('Request ID validation', () => {
  it('reuses a safe X-Request-Id', () => {
    const id = getRequestId(/** @type {any} */ ({ headers: { 'x-request-id': 'abc-123' } }));
    assert.equal(id, 'abc-123');
  });

  it('rejects an injection / oversized X-Request-Id and generates a fresh one', () => {
    const evil = getRequestId(/** @type {any} */ ({ headers: { 'x-request-id': 'a\r\nb' } }));
    assert.notEqual(evil, 'a\r\nb');
    const huge = getRequestId(
      /** @type {any} */ ({ headers: { 'x-request-id': 'a'.repeat(500) } }),
    );
    assert.notEqual(huge, 'a'.repeat(500));
  });
});

describe('CORS misconfiguration guard', () => {
  it('throws when credentials is combined with a wildcard origin', () => {
    const app = createApp();
    assert.throws(() => cors(app, { credentials: true }), /credentials/);
    assert.throws(() => cors(app, { credentials: true, origin: '*' }), /credentials/);
  });

  it('allows credentials with an explicit origin', () => {
    const app = createApp();
    assert.doesNotThrow(() => cors(app, { credentials: true, origin: 'https://example.com' }));
  });
});

describe('Rate limiter pluggable store', () => {
  it('uses a custom store and blocks over the limit', async () => {
    const backing = new Map();
    const store = {
      get: (k) => backing.get(k),
      set: (k, v) => backing.set(k, v),
    };
    const app = createApp();
    rateLimit(app, { max: 1, window: 60_000, store, keyFn: () => 'fixed' });
    app.get('/', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const first = await fetch(`http://127.0.0.1:${port}/`);
    const second = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(first.status, 200);
    assert.equal(second.status, HTTP.TOO_MANY_REQUESTS);
    assert.ok(backing.has('fixed'));
    await app.close();
  });
});

describe('Body size limit', () => {
  it('rejects early on an oversized Content-Length', async () => {
    const stream = new Readable({
      read() {
        this.push(null);
      },
    });
    /** @type {any} */ (stream).headers = { 'content-length': '999999' };
    await assert.rejects(
      () => collectBody(/** @type {any} */ (stream), { limit: 100 }),
      (err) => /** @type {any} */ (err).statusCode === HTTP.PAYLOAD_TOO_LARGE,
    );
  });
});
