import { RadixTrie } from './radix.trie.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/**
 * Router facade — one trie per HTTP method.
 */
export class Router {
  /** @type {Map<string, RadixTrie>} */
  #tries = new Map();

  constructor() {
    for (const method of HTTP_METHODS) {
      this.#tries.set(method, new RadixTrie());
    }
  }

  /**
   * Register a route.
   * @param {string} method — HTTP method (uppercase)
   * @param {string} path
   * @param {any} data
   */
  add(method, path, data) {
    const upper = method.toUpperCase();
    let trie = this.#tries.get(upper);
    if (!trie) {
      trie = new RadixTrie();
      this.#tries.set(upper, trie);
    }
    trie.insert(path, data);
  }

  /**
   * Register a route for ALL methods.
   * @param {string} path
   * @param {any} data
   */
  addAll(path, data) {
    for (const method of HTTP_METHODS) {
      this.add(method, path, data);
    }
  }

  /**
   * Find a matching route.
   * @param {string} method
   * @param {string} path
   * @returns {{ data: any, params: Object<string, string> } | null}
   */
  find(method, path) {
    const trie = this.#tries.get(method.toUpperCase());
    if (!trie) return null;
    return trie.lookup(path);
  }
}
