import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createApp, compression } from '../src/index.js';

/**
 * Raw HTTP request that does NOT auto-decompress (unlike fetch).
 * @param {number} port
 * @param {string} path
 * @param {Object<string, string>} [headers]
 * @returns {Promise<{ statusCode: number, headers: Object, body: Buffer }>}
 */
function rawGet(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
  });
}

describe('Compression plugin', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should compress JSON responses with gzip', async () => {
    app = createApp();
    app.register(compression, { threshold: 0 }); // compress everything
    app.get('/test', (ctx) => ctx.send({ data: 'a'.repeat(200) }));
    const { port } = await app.listen({ port: 0 });

    const res = await rawGet(port, '/test', { 'Accept-Encoding': 'gzip' });
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.ok(res.headers['vary']?.includes('Accept-Encoding'));

    const decompressed = zlib.gunzipSync(res.body);
    const body = JSON.parse(decompressed.toString());
    assert.equal(body.data, 'a'.repeat(200));
  });

  it('should compress with deflate', async () => {
    app = createApp();
    app.register(compression, { threshold: 0 });
    app.get('/test', (ctx) => ctx.send({ hello: 'world' }));
    const { port } = await app.listen({ port: 0 });

    const res = await rawGet(port, '/test', { 'Accept-Encoding': 'deflate' });
    assert.equal(res.headers['content-encoding'], 'deflate');

    const decompressed = zlib.inflateSync(res.body);
    const body = JSON.parse(decompressed.toString());
    assert.equal(body.hello, 'world');
  });

  it('should not compress when Accept-Encoding is missing', async () => {
    app = createApp();
    app.register(compression, { threshold: 0 });
    app.get('/test', (ctx) => ctx.send({ hello: 'world' }));
    const { port } = await app.listen({ port: 0 });

    const res = await rawGet(port, '/test', { 'Accept-Encoding': 'identity' });
    assert.notEqual(res.headers['content-encoding'], 'gzip');
    const body = JSON.parse(res.body.toString());
    assert.equal(body.hello, 'world');
  });

  it('should skip compression for small responses above threshold', async () => {
    app = createApp();
    app.register(compression, { threshold: 10000 });
    app.get('/test', (ctx) => ctx.send({ small: true }));
    const { port } = await app.listen({ port: 0 });

    const res = await rawGet(port, '/test', { 'Accept-Encoding': 'gzip' });
    assert.notEqual(res.headers['content-encoding'], 'gzip');
    const body = JSON.parse(res.body.toString());
    assert.equal(body.small, true);
  });
});
