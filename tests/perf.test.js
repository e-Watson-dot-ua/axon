import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';
import { HTTP } from '../src/utils/http.status.js';

describe('Performance smoke test', () => {
  /** @type {import('./app.js').Axon | null} */
  let app = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should handle 1000 sequential JSON requests', async () => {
    app = createApp();
    app.get('/json', (ctx) => ctx.send({ hello: 'world' }));
    const { port } = await app.listen({ port: 0 });

    const count = 1000;
    const start = performance.now();

    for (let i = 0; i < count; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      assert.equal(res.status, HTTP.OK);
      await res.json();
    }

    const elapsed = performance.now() - start;
    const rps = Math.round(count / (elapsed / 1000));

    // eslint-disable-next-line no-console
    console.log(`  ${count} requests in ${elapsed.toFixed(0)}ms — ${rps} req/s`);

    // Sanity check: should be able to do at least 100 req/s
    assert.ok(rps > 100, `Expected >100 req/s, got ${rps}`);
  });
});
