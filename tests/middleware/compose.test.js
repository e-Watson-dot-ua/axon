import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/middleware/compose.js';

describe('compose', () => {
  it('should execute middleware in order (onion model)', async () => {
    const order = [];

    const mw1 = async (_ctx, next) => {
      order.push('1-before');
      await next();
      order.push('1-after');
    };
    const mw2 = async (_ctx, next) => {
      order.push('2-before');
      await next();
      order.push('2-after');
    };
    const mw3 = async (_ctx, next) => {
      order.push('3');
      await next();
    };

    const fn = compose([mw1, mw2, mw3]);
    await fn(/** @type {any} */ ({}));

    assert.deepEqual(order, ['1-before', '2-before', '3', '2-after', '1-after']);
  });

  it('should short-circuit when next() is not called', async () => {
    const order = [];

    const mw1 = async (_ctx, _next) => {
      order.push('1');
      // deliberately not calling next()
    };
    const mw2 = async (_ctx, next) => {
      order.push('2');
      await next();
    };

    const fn = compose([mw1, mw2]);
    await fn(/** @type {any} */ ({}));

    assert.deepEqual(order, ['1']);
  });

  it('should propagate errors', async () => {
    const fn = compose([
      async () => {
        throw new Error('boom');
      },
    ]);

    await assert.rejects(() => fn(/** @type {any} */ ({})), { message: 'boom' });
  });

  it('should reject if next() called multiple times', async () => {
    const fn = compose([
      async (_ctx, next) => {
        await next();
        await next();
      },
    ]);

    await assert.rejects(() => fn(/** @type {any} */ ({})), {
      message: 'next() called multiple times',
    });
  });

  it('should call finalNext after all middleware', async () => {
    const order = [];

    const fn = compose([
      async (_ctx, next) => {
        order.push('mw');
        await next();
      },
    ]);

    await fn(/** @type {any} */ ({}), async () => {
      order.push('final');
    });

    assert.deepEqual(order, ['mw', 'final']);
  });

  it('should handle empty middleware array', async () => {
    const fn = compose([]);
    await fn(/** @type {any} */ ({}));
    // should not throw
  });

  it('should pass ctx through all middleware', async () => {
    const ctx = { value: 0 };

    const fn = compose([
      async (c, next) => {
        c.value += 1;
        await next();
      },
      async (c, next) => {
        c.value += 10;
        await next();
      },
    ]);

    await fn(/** @type {any} */ (ctx));
    assert.equal(ctx.value, 11);
  });
});
