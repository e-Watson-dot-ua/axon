import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HookRegistry } from '../../src/lifecycle/hooks.js';

describe('HookRegistry', () => {
  it('should add and retrieve hooks', () => {
    const reg = new HookRegistry();
    const fn1 = () => {};
    const fn2 = () => {};

    reg.add('onRequest', fn1);
    reg.add('onRequest', fn2);

    const hooks = reg.get('onRequest');
    assert.equal(hooks.length, 2);
    assert.equal(hooks[0], fn1);
    assert.equal(hooks[1], fn2);
  });

  it('should return empty array for unused hooks', () => {
    const reg = new HookRegistry();
    assert.deepEqual(reg.get('onSend'), []);
  });

  it('should throw on unknown hook name', () => {
    const reg = new HookRegistry();
    assert.throws(() => reg.add('badHook', () => {}), /Unknown hook: "badHook"/);
  });

  it('should maintain insertion order', () => {
    const reg = new HookRegistry();
    const order = [];
    reg.add('preHandler', () => order.push(1));
    reg.add('preHandler', () => order.push(2));
    reg.add('preHandler', () => order.push(3));

    for (const fn of reg.get('preHandler')) fn();
    assert.deepEqual(order, [1, 2, 3]);
  });
});
