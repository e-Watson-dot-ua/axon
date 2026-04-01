import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RadixTrie } from '../../src/router/radix.trie.js';

/** Helper: assert lookup result matches expected data and params. */
function assertMatch(result, data, params = {}) {
  assert.ok(result !== null, 'expected a match, got null');
  assert.equal(result.data, data);
  for (const [k, v] of Object.entries(params)) {
    assert.equal(result.params[k], v);
  }
  assert.equal(Object.keys(result.params).length, Object.keys(params).length);
}

describe('RadixTrie — static insert & lookup', () => {
  it('should insert and lookup a single static path', () => {
    const trie = new RadixTrie();
    trie.insert('/hello', 'h');

    assertMatch(trie.lookup('/hello'), 'h');
  });

  it('should insert and lookup multiple static paths', () => {
    const trie = new RadixTrie();
    trie.insert('/a', 1);
    trie.insert('/b', 2);
    trie.insert('/a/b/c', 3);

    assert.equal(trie.lookup('/a').data, 1);
    assert.equal(trie.lookup('/b').data, 2);
    assert.equal(trie.lookup('/a/b/c').data, 3);
  });

  it('should return null for unregistered paths', () => {
    const trie = new RadixTrie();
    trie.insert('/exists', 'yes');

    assert.equal(trie.lookup('/nope'), null);
    assert.equal(trie.lookup('/exists/extra'), null);
  });

  it('should handle root path', () => {
    const trie = new RadixTrie();
    trie.insert('/', 'root');

    assertMatch(trie.lookup('/'), 'root');
  });
});

describe('RadixTrie — named params', () => {
  it('should match a single param', () => {
    const trie = new RadixTrie();
    trie.insert('/users/:id', 'user');

    const result = trie.lookup('/users/42');
    assert.equal(result.data, 'user');
    assert.equal(result.params.id, '42');
  });

  it('should match multiple params', () => {
    const trie = new RadixTrie();
    trie.insert('/orgs/:org/repos/:repo', 'repo');

    const result = trie.lookup('/orgs/acme/repos/axon');
    assert.equal(result.data, 'repo');
    assert.equal(result.params.org, 'acme');
    assert.equal(result.params.repo, 'axon');
  });

  it('should prefer static over param', () => {
    const trie = new RadixTrie();
    trie.insert('/users/me', 'static');
    trie.insert('/users/:id', 'param');

    assert.equal(trie.lookup('/users/me').data, 'static');
    assert.equal(trie.lookup('/users/42').data, 'param');
  });

  it('should not match param when trailing segments remain', () => {
    const trie = new RadixTrie();
    trie.insert('/users/:id', 'user');

    assert.equal(trie.lookup('/users/42/extra'), null);
  });
});

describe('RadixTrie — wildcard', () => {
  it('should capture the rest of the path', () => {
    const trie = new RadixTrie();
    trie.insert('/files/*path', 'file');

    const result = trie.lookup('/files/a/b/c.txt');
    assert.equal(result.data, 'file');
    assert.equal(result.params.path, 'a/b/c.txt');
  });

  it('should match a single segment', () => {
    const trie = new RadixTrie();
    trie.insert('/static/*file', 'static');

    const result = trie.lookup('/static/index.html');
    assert.equal(result.params.file, 'index.html');
  });

  it('should prefer static and param over wildcard', () => {
    const trie = new RadixTrie();
    trie.insert('/api/health', 'static');
    trie.insert('/api/:resource', 'param');
    trie.insert('/api/*rest', 'wild');

    assert.equal(trie.lookup('/api/health').data, 'static');
    assert.equal(trie.lookup('/api/users').data, 'param');
    assert.equal(trie.lookup('/api/users/123').data, 'wild');
  });

  it('should use default name "wild" when none given', () => {
    const trie = new RadixTrie();
    trie.insert('/catch/*', 'all');

    const result = trie.lookup('/catch/anything/here');
    assert.equal(result.params.wild, 'anything/here');
  });
});
