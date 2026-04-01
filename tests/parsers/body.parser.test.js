import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseBody } from '../../src/parsers/body.parser.js';
import { parseJson } from '../../src/parsers/json.parser.js';
import { parseText } from '../../src/parsers/text.parser.js';
import { parseUrlencoded } from '../../src/parsers/urlencoded.parser.js';
import { HTTP } from '../../src/utils/http.status.js';

/**
 * Create a mock request with body and content-type.
 * @param {string} body
 * @param {string} contentType
 */
function mockReq(body, contentType) {
  const buf = Buffer.from(body, 'utf8');
  const stream = new Readable({ read() { this.push(buf); this.push(null); } });
  stream.headers = { 'content-type': contentType };
  return /** @type {any} */ (stream);
}

describe('parseJson', () => {
  it('should parse valid JSON', () => {
    const result = parseJson(Buffer.from('{"a":1}'));
    assert.deepEqual(result, { a: 1 });
  });

  it('should throw 400 on invalid JSON', () => {
    assert.throws(() => parseJson(Buffer.from('not json')), (err) => {
      assert.equal(/** @type {any} */ (err).statusCode, HTTP.BAD_REQUEST);
      return true;
    });
  });
});

describe('parseText', () => {
  it('should decode buffer as UTF-8', () => {
    assert.equal(parseText(Buffer.from('hello')), 'hello');
  });

  it('should handle unicode', () => {
    assert.equal(parseText(Buffer.from('café ☕')), 'café ☕');
  });
});

describe('parseUrlencoded', () => {
  it('should parse key=value pairs', () => {
    const result = parseUrlencoded(Buffer.from('name=axon&version=1'));
    assert.equal(result.name, 'axon');
    assert.equal(result.version, '1');
  });

  it('should handle encoded characters', () => {
    const result = parseUrlencoded(Buffer.from('q=hello%20world&tag=%26'));
    assert.equal(result.q, 'hello world');
    assert.equal(result.tag, '&');
  });
});

describe('parseBody (dispatcher)', () => {
  it('should parse JSON body', async () => {
    const req = mockReq('{"ok":true}', 'application/json');
    const result = await parseBody(req);
    assert.deepEqual(result, { ok: true });
  });

  it('should parse JSON with charset', async () => {
    const req = mockReq('{"ok":true}', 'application/json; charset=utf-8');
    const result = await parseBody(req);
    assert.deepEqual(result, { ok: true });
  });

  it('should parse text body', async () => {
    const req = mockReq('hello', 'text/plain');
    const result = await parseBody(req);
    assert.equal(result, 'hello');
  });

  it('should parse urlencoded body', async () => {
    const req = mockReq('a=1&b=2', 'application/x-www-form-urlencoded');
    const result = await parseBody(req);
    assert.equal(result.a, '1');
    assert.equal(result.b, '2');
  });

  it('should return raw buffer for unknown content type', async () => {
    const req = mockReq('binary', 'application/octet-stream');
    const result = await parseBody(req);
    assert.ok(Buffer.isBuffer(result));
    assert.equal(result.toString(), 'binary');
  });

  it('should return undefined for empty body', async () => {
    const stream = new Readable({ read() { this.push(null); } });
    stream.headers = { 'content-type': 'application/json' };
    const result = await parseBody(/** @type {any} */ (stream));
    assert.equal(result, undefined);
  });
});
