import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runHooks } from '../../src/lifecycle/pipeline.js';

describe('runHooks', () => {
  it('should run hooks sequentially', async () => {
    const order = [];
    const hooks = [
      async () => order.push(1),
      async () => order.push(2),
      async () => order.push(3),
    ];

    await runHooks(hooks);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it('should pass arguments to each hook', async () => {
    const received = [];
    const hooks = [async (a, b) => received.push([a, b])];

    await runHooks(hooks, 'x', 'y');
    assert.deepEqual(received, [['x', 'y']]);
  });

  it('should stop on first error', async () => {
    const order = [];
    const hooks = [
      async () => order.push(1),
      async () => { throw new Error('fail'); },
      async () => order.push(3),
    ];

    await assert.rejects(() => runHooks(hooks), { message: 'fail' });
    assert.deepEqual(order, [1]);
  });

  it('should handle empty array', async () => {
    await runHooks([]);
    // should not throw
  });
});
