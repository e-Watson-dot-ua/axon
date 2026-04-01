import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { collectBody } from '../../src/utils/stream.utils.js';

/**
 * Create a mock IncomingMessage-like readable stream.
 * @param {Buffer | string} data
 * @returns {import('node:http').IncomingMessage}
 */
function mockReq(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const stream = new Readable({
    read() {
      this.push(buf);
      this.push(null);
    },
  });
  return /** @type {any} */ (stream);
}

describe('collectBody', () => {
  it('should collect a buffer from the stream', async () => {
    const req = mockReq('hello world');
    const buf = await collectBody(req);

    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.toString(), 'hello world');
  });

  it('should collect an empty body', async () => {
    const stream = new Readable({ read() { this.push(null); } });
    const buf = await collectBody(/** @type {any} */ (stream));

    assert.equal(buf.length, 0);
  });

  it('should reject when body exceeds limit', async () => {
    const req = mockReq('a'.repeat(100));

    await assert.rejects(() => collectBody(req, { limit: 10 }), (err) => {
      assert.equal(/** @type {any} */ (err).statusCode, 413);
      return true;
    });
  });

  it('should accept body exactly at limit', async () => {
    const req = mockReq('a'.repeat(10));
    const buf = await collectBody(req, { limit: 10 });

    assert.equal(buf.length, 10);
  });
});
