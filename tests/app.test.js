import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

describe('createApp — bare server', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should start and return address/port', async () => {
    app = createApp();
    const { port, address } = await app.listen({ port: 0 });

    assert.ok(typeof port === 'number' && port > 0);
    assert.ok(typeof address === 'string');
  });

  it('should respond 404 for any request', async () => {
    app = createApp();
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/anything`);
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(body.error, 'Not Found');
  });

  it('should close gracefully', async () => {
    app = createApp();
    await app.listen({ port: 0 });
    await app.close();
    app = null;
  });

  it('should resolve close() when server is not started', async () => {
    app = createApp();
    await app.close();
    app = null;
  });
});

describe('Axon — routing', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should route GET requests', async () => {
    app = createApp();
    app.get('/hello', (ctx) => ctx.send({ msg: 'hi' }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/hello`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.msg, 'hi');
  });

  it('should route POST requests', async () => {
    app = createApp();
    app.post('/items', (ctx) => ctx.status(201).send({ created: true }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/items`, { method: 'POST' });
    const body = await res.json();

    assert.equal(res.status, 201);
    assert.equal(body.created, true);
  });

  it('should expose route params', async () => {
    app = createApp();
    app.get('/users/:id', (ctx) => ctx.send({ id: ctx.params.id }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/users/42`);
    const body = await res.json();

    assert.equal(body.id, '42');
  });

  it('should return 404 for wrong method', async () => {
    app = createApp();
    app.get('/only-get', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/only-get`, { method: 'DELETE' });
    assert.equal(res.status, 404);
  });

  it('should support app.all() for any method', async () => {
    app = createApp();
    app.all('/any', (ctx) => ctx.send({ method: ctx.method }));
    const { port } = await app.listen({ port: 0 });

    const get = await fetch(`http://127.0.0.1:${port}/any`);
    assert.equal((await get.json()).method, 'GET');

    const post = await fetch(`http://127.0.0.1:${port}/any`, { method: 'POST' });
    assert.equal((await post.json()).method, 'POST');
  });

  it('should run route-level middleware', async () => {
    app = createApp();
    const mw = async (ctx, next) => {
      ctx.state.tagged = true;
      await next();
    };
    app.get('/mw', mw, (ctx) => ctx.send({ tagged: ctx.state.tagged }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/mw`);
    const body = await res.json();
    assert.equal(body.tagged, true);
  });

  it('should catch errors and return statusCode', async () => {
    app = createApp();
    app.get('/boom', () => {
      const err = new Error('fail');
      /** @type {any} */ (err).statusCode = 422;
      throw err;
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/boom`);
    const body = await res.json();

    assert.equal(res.status, 422);
    assert.equal(body.error, 'fail');
  });

  it('should support method chaining', () => {
    app = createApp();
    const ret = app
      .get('/a', (ctx) => ctx.send('a'))
      .post('/b', (ctx) => ctx.send('b'));

    assert.equal(ret, app);
  });
});

describe('Axon — route grouping', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should prefix routes in a group', async () => {
    app = createApp();
    app.group('/api/v1', (g) => {
      g.get('/users', (ctx) => ctx.send({ route: 'users' }));
      g.get('/users/:id', (ctx) => ctx.send({ id: ctx.params.id }));
    });
    const { port } = await app.listen({ port: 0 });

    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/users`);
    assert.equal((await res1.json()).route, 'users');

    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/users/7`);
    assert.equal((await res2.json()).id, '7');
  });

  it('should support nested groups', async () => {
    app = createApp();
    app.group('/api', (api) => {
      api.group('/v2', (v2) => {
        v2.get('/health', (ctx) => ctx.send({ ok: true }));
      });
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/api/v2/health`);
    assert.equal((await res.json()).ok, true);
  });

  it('should not match unprefixed paths', async () => {
    app = createApp();
    app.group('/api', (g) => {
      g.get('/test', (ctx) => ctx.send('ok'));
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.status, 404);
  });
});

describe('Axon — global middleware', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should run global middleware before route handler', async () => {
    app = createApp();
    app.use(async (ctx, next) => {
      ctx.state.before = true;
      await next();
    });
    app.get('/test', (ctx) => ctx.send({ before: ctx.state.before }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal((await res.json()).before, true);
  });

  it('should run global middleware in onion order', async () => {
    const order = [];
    app = createApp();

    app.use(async (_ctx, next) => {
      order.push('g1-before');
      await next();
      order.push('g1-after');
    });
    app.use(async (_ctx, next) => {
      order.push('g2-before');
      await next();
      order.push('g2-after');
    });

    app.get('/test', (ctx) => {
      order.push('handler');
      ctx.send('ok');
    });

    const { port } = await app.listen({ port: 0 });
    await fetch(`http://127.0.0.1:${port}/test`);

    assert.deepEqual(order, ['g1-before', 'g2-before', 'handler', 'g2-after', 'g1-after']);
  });

  it('should run global middleware even on 404', async () => {
    app = createApp();
    app.use(async (ctx, next) => {
      ctx.header('X-Global', 'yes');
      await next();
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('x-global'), 'yes');
  });

  it('should run global middleware before route-level middleware', async () => {
    const order = [];
    app = createApp();

    app.use(async (_ctx, next) => {
      order.push('global');
      await next();
    });

    const routeMw = async (_ctx, next) => {
      order.push('route-mw');
      await next();
    };

    app.get('/test', routeMw, (ctx) => {
      order.push('handler');
      ctx.send('ok');
    });

    const { port } = await app.listen({ port: 0 });
    await fetch(`http://127.0.0.1:${port}/test`);

    assert.deepEqual(order, ['global', 'route-mw', 'handler']);
  });

  it('should short-circuit if global middleware does not call next', async () => {
    app = createApp();
    app.use(async (ctx) => {
      ctx.status(403).send({ error: 'Forbidden' });
    });
    app.get('/test', (ctx) => ctx.send('should not reach'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'Forbidden');
  });
});

describe('Axon — lifecycle hooks', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should run onRequest before handler', async () => {
    app = createApp();
    app.addHook('onRequest', async (ctx) => {
      ctx.state.onRequest = true;
    });
    app.get('/test', (ctx) => ctx.send({ hook: ctx.state.onRequest }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal((await res.json()).hook, true);
  });

  it('should run preHandler before handler', async () => {
    app = createApp();
    app.addHook('preHandler', async (ctx) => {
      ctx.state.preHandler = true;
    });
    app.get('/test', (ctx) => ctx.send({ hook: ctx.state.preHandler }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal((await res.json()).hook, true);
  });

  it('should run onResponse after response is sent', async () => {
    let onResponseCalled = false;
    app = createApp();
    app.addHook('onResponse', async () => {
      onResponseCalled = true;
    });
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    await fetch(`http://127.0.0.1:${port}/test`);
    // Small delay to let async hooks complete
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(onResponseCalled, true);
  });

  it('should run hooks in lifecycle order', async () => {
    /** @type {string[]} */
    const order = [];
    app = createApp();
    app.addHook('onRequest', async () => order.push('onRequest'));
    app.addHook('preParsing', async () => order.push('preParsing'));
    app.addHook('preValidation', async () => order.push('preValidation'));
    app.addHook('preHandler', async () => order.push('preHandler'));
    app.addHook('preSerialization', async () => order.push('preSerialization'));
    app.addHook('onSend', async () => order.push('onSend'));
    app.addHook('onResponse', async () => order.push('onResponse'));

    app.get('/test', (ctx) => {
      order.push('handler');
      ctx.send('ok');
    });

    const { port } = await app.listen({ port: 0 });
    await fetch(`http://127.0.0.1:${port}/test`);
    await new Promise((r) => setTimeout(r, 50));

    assert.deepEqual(order, [
      'onRequest',
      'preParsing',
      'preValidation',
      'preHandler',
      'handler',
      'preSerialization',
      'onSend',
      'onResponse',
    ]);
  });

  it('should route errors through onError hook', async () => {
    app = createApp();
    app.onError(async (err, ctx) => {
      ctx.status(err.statusCode ?? 500).send({ custom: err.message });
    });
    app.get('/boom', () => {
      throw new Error('test error');
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/boom`);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.custom, 'test error');
  });

  it('should short-circuit if onRequest sends a response', async () => {
    let handlerCalled = false;
    app = createApp();
    app.addHook('onRequest', async (ctx) => {
      ctx.status(401).send({ error: 'Unauthorized' });
    });
    app.get('/test', () => {
      handlerCalled = true;
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.status, 401);
    assert.equal(handlerCalled, false);
  });

  it('should throw on unknown hook name', () => {
    app = createApp();
    assert.throws(() => app.addHook('badName', () => {}), /Unknown hook/);
  });
});

describe('Axon — body parsing', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should parse JSON body on POST', async () => {
    app = createApp();
    app.post('/echo', (ctx) => ctx.send({ received: ctx.body }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'axon' }),
    });
    const body = await res.json();
    assert.deepEqual(body.received, { name: 'axon' });
  });

  it('should parse URL-encoded body on POST', async () => {
    app = createApp();
    app.post('/form', (ctx) => ctx.send({ received: ctx.body }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'user=alice&role=admin',
    });
    const body = await res.json();
    assert.equal(body.received.user, 'alice');
    assert.equal(body.received.role, 'admin');
  });

  it('should not parse body on GET', async () => {
    app = createApp();
    app.get('/test', (ctx) => ctx.send({ body: ctx.body ?? null }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    const body = await res.json();
    assert.equal(body.body, null);
  });

  it('should return 400 for invalid JSON', async () => {
    app = createApp();
    app.post('/json', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    });
    assert.equal(res.status, 400);
  });
});

describe('Axon — validation', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should return 400 when body fails schema validation', async () => {
    app = createApp();
    app.post('/users', {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1 } },
        },
      },
      handler(ctx) { ctx.send({ ok: true }); },
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('Validation failed'));
  });

  it('should pass when body matches schema', async () => {
    app = createApp();
    app.post('/users', {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1 } },
        },
      },
      handler(ctx) { ctx.send({ ok: true }); },
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'axon' }),
    });
    assert.equal(res.status, 200);
  });

  it('should support custom validator via setValidator', async () => {
    app = createApp();
    app.setValidator(() => ({ valid: false, errors: ['custom error'] }));
    app.post('/test', {
      schema: { body: { type: 'object' } },
      handler(ctx) { ctx.send('ok'); },
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anything: true }),
    });
    assert.equal(res.status, 400);
  });
});
