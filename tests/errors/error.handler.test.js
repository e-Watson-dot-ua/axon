import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { HttpError } from '../../src/errors/http.error.js';

describe('Error handling — edge cases', () => {
  /** @type {import('../app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should not crash on double send()', async () => {
    app = createApp();
    app.get('/double', (ctx) => {
      ctx.send('first');
      ctx.send('second'); // should be silently ignored
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/double`);
    const body = await res.text();
    assert.equal(body, 'first');
  });

  it('should return 500 for unhandled errors without statusCode', async () => {
    app = createApp();
    app.get('/err', () => { throw new Error('oops'); });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/err`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'oops');
  });

  it('should use HttpError statusCode', async () => {
    app = createApp();
    app.get('/notfound', () => { throw new HttpError(404, 'Gone'); });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/notfound`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'Gone');
  });

  it('should fall back to default handler when onError hook throws', async () => {
    app = createApp();
    app.onError(() => { throw new Error('hook also fails'); });
    app.get('/err', () => { throw new HttpError(422, 'original'); });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/err`);
    // Falls back to default: uses the original error
    assert.ok([422, 500].includes(res.status));
  });
});
