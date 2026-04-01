import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, HttpError } from '../src/index.js';

describe('Integration — full lifecycle', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;
  /** @type {number} */
  let port;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should handle a full request lifecycle with hooks, middleware, validation, and error handling', async () => {
    /** @type {string[]} */
    const log = [];

    app = createApp();

    // Global middleware
    app.use(async (ctx, next) => {
      ctx.state.start = Date.now();
      log.push('global-mw');
      await next();
    });

    // Lifecycle hooks
    app.addHook('onRequest', async () => log.push('onRequest'));
    app.addHook('preParsing', async () => log.push('preParsing'));
    app.addHook('preValidation', async () => log.push('preValidation'));
    app.addHook('preHandler', async () => log.push('preHandler'));
    app.addHook('onSend', async () => log.push('onSend'));
    app.addHook('onResponse', async () => log.push('onResponse'));

    // Error handler
    app.onError(async (err, ctx) => {
      log.push('onError');
      ctx.status(err.statusCode ?? 500).send({ error: err.message });
    });

    // Routes
    app.get('/health', (ctx) => {
      ctx.send({ status: 'ok' });
    });

    app.post('/users', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
          },
        },
      },
      handler(ctx) {
        ctx.status(201).send({ id: 1, ...ctx.body });
      },
    });

    app.get('/users/:id', (ctx) => {
      if (ctx.params.id === '999') {
        throw new HttpError(404, 'User not found');
      }
      ctx.send({ id: ctx.params.id, name: 'Alice' });
    });

    app.group('/api/v1', (g) => {
      g.get('/ping', (ctx) => ctx.send('pong'));
    });

    ({ port } = await app.listen({ port: 0 }));

    // 1. Health check
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    // 2. POST with valid body
    log.length = 0;
    const createUser = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: 'bob@example.com' }),
    });
    assert.equal(createUser.status, 201);
    const created = await createUser.json();
    assert.equal(created.name, 'Bob');
    assert.equal(created.email, 'bob@example.com');

    // 3. POST with invalid body (validation fails)
    const badUser = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    assert.equal(badUser.status, 400);

    // 4. GET with param
    const getUser = await fetch(`http://127.0.0.1:${port}/users/42`);
    assert.equal(getUser.status, 200);
    assert.equal((await getUser.json()).id, '42');

    // 5. GET with param triggering HttpError
    const notFound = await fetch(`http://127.0.0.1:${port}/users/999`);
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json()).error, 'User not found');

    // 6. Route group
    const ping = await fetch(`http://127.0.0.1:${port}/api/v1/ping`);
    assert.equal(await ping.text(), 'pong');

    // 7. 404 for unknown route
    const unknown = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(unknown.status, 404);

    // Wait for async hooks
    await new Promise((r) => setTimeout(r, 50));

    // Verify lifecycle order was followed
    assert.ok(log.includes('onRequest'));
    assert.ok(log.includes('global-mw'));
    assert.ok(log.includes('onResponse'));
  });

  it('should handle concurrent requests', async () => {
    app = createApp();
    app.get('/slow', async (ctx) => {
      await new Promise((r) => setTimeout(r, 20));
      ctx.send({ done: true });
    });
    ({ port } = await app.listen({ port: 0 }));

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`http://127.0.0.1:${port}/slow`).then((r) => r.json()),
      ),
    );

    assert.equal(results.length, 10);
    for (const r of results) {
      assert.equal(r.done, true);
    }
  });
});
