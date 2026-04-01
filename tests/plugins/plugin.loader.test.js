import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

describe('app.decorate / app.decorateCtx', () => {
  it('should add a property to the app instance', () => {
    const app = createApp();
    app.decorate('db', { connected: true });
    assert.equal(/** @type {any} */ (app).db.connected, true);
  });

  it('should throw if decorator already exists on app', () => {
    const app = createApp();
    app.decorate('foo', 1);
    assert.throws(() => app.decorate('foo', 2), /already exists/);
  });

  it('should add a property to every Ctx', async () => {
    const app = createApp();
    app.decorateCtx('requestTime', 0);
    app.addHook('onRequest', async (ctx) => {
      /** @type {any} */ (ctx).requestTime = Date.now();
    });
    app.get('/test', (ctx) => {
      ctx.send({ hasTime: /** @type {any} */ (ctx).requestTime > 0 });
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal((await res.json()).hasTime, true);
    await app.close();
  });
});

describe('app.register (plugins)', () => {
  /** @type {import('../app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should call plugin function with app and opts', () => {
    app = createApp();
    let receivedOpts = null;
    const plugin = (_app, opts) => { receivedOpts = opts; };
    app.register(plugin, { key: 'value' });
    assert.deepEqual(receivedOpts, { key: 'value' });
  });

  it('should allow plugin to add hooks', async () => {
    app = createApp();
    let hookRan = false;

    function myPlugin(app) {
      app.addHook('onRequest', async () => { hookRan = true; });
    }

    app.register(myPlugin);
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(hookRan, true);
  });

  it('should support chaining', () => {
    app = createApp();
    const ret = app
      .register(() => {})
      .register(() => {});
    assert.equal(ret, app);
  });
});
