import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../../src/router/router.js';

describe('Router facade', () => {
  it('should add and find routes by method', () => {
    const router = new Router();
    router.add('GET', '/users', 'list');
    router.add('POST', '/users', 'create');

    assert.equal(router.find('GET', '/users').data, 'list');
    assert.equal(router.find('POST', '/users').data, 'create');
  });

  it('should return null for wrong method', () => {
    const router = new Router();
    router.add('GET', '/users', 'list');

    assert.equal(router.find('DELETE', '/users'), null);
  });

  it('should return null for unregistered path', () => {
    const router = new Router();
    router.add('GET', '/a', 1);

    assert.equal(router.find('GET', '/b'), null);
  });

  it('should support addAll for all methods', () => {
    const router = new Router();
    router.addAll('/health', 'ok');

    assert.equal(router.find('GET', '/health').data, 'ok');
    assert.equal(router.find('POST', '/health').data, 'ok');
    assert.equal(router.find('PUT', '/health').data, 'ok');
    assert.equal(router.find('DELETE', '/health').data, 'ok');
    assert.equal(router.find('PATCH', '/health').data, 'ok');
  });

  it('should pass through params from trie', () => {
    const router = new Router();
    router.add('GET', '/users/:id', 'user');

    const result = router.find('GET', '/users/99');
    assert.equal(result.data, 'user');
    assert.equal(result.params.id, '99');
  });

  it('should be case-insensitive on method', () => {
    const router = new Router();
    router.add('get', '/test', 'x');

    assert.equal(router.find('GET', '/test').data, 'x');
  });
});
