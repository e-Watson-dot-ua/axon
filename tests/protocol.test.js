import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';

/** @param {number} port @param {string} method @param {string} path */
function request(port, method, path) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          allow: res.headers['allow'],
          contentLength: res.headers['content-length'],
          bytes: Buffer.concat(chunks).length,
        }),
      );
    });
    r.on('error', reject);
    r.end();
  });
}

describe('HTTP method semantics', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function start() {
    app = createApp();
    app.get('/users/:id', (ctx) => ctx.send({ id: ctx.params.id }));
    app.post('/users/:id', (ctx) => ctx.send({ ok: true }));
    return (await app.listen({ port: 0 })).port;
  }

  it('routes HEAD to the GET handler with no body but correct Content-Length', async () => {
    const port = await start();
    const res = await request(port, 'HEAD', '/users/7');
    assert.equal(res.status, 200);
    assert.equal(res.contentLength, '10');
    assert.equal(res.bytes, 0);
  });

  it('returns 405 with an Allow header when the method is not registered', async () => {
    const port = await start();
    const res = await request(port, 'DELETE', '/users/7');
    assert.equal(res.status, 405);
    assert.ok(res.allow?.includes('GET'));
    assert.ok(res.allow?.includes('POST'));
    assert.ok(res.allow?.includes('OPTIONS'));
  });

  it('auto-answers OPTIONS with 204 and an Allow header', async () => {
    const port = await start();
    const res = await request(port, 'OPTIONS', '/users/7');
    assert.equal(res.status, 204);
    assert.ok(res.allow?.includes('GET'));
    assert.ok(res.allow?.includes('HEAD'));
  });

  it('returns 404 (no Allow) for a path with no routes', async () => {
    const port = await start();
    const res = await request(port, 'GET', '/missing');
    assert.equal(res.status, 404);
    assert.equal(res.allow, undefined);
  });
});
