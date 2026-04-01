import { RouteNode } from './route.node.js';

/**
 * Radix trie for fast URL path matching.
 * Supports static segments, named params (:id), and wildcards (*path).
 */
export class RadixTrie {
  #root = new RouteNode('');

  /**
   * Insert a path with associated data.
   * @param {string} path
   * @param {any} data
   */
  insert(path, data) {
    const segments = splitPath(path);
    let node = this.#root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (seg.startsWith('*')) {
        const name = seg.slice(1) || 'wild';
        if (!node.wildcardChild) {
          node.wildcardChild = new RouteNode(seg);
          node.wildcardName = name;
        }
        node = node.wildcardChild;
        break; // wildcard consumes the rest — must be last
      }

      if (seg.startsWith(':')) {
        const name = seg.slice(1);
        if (!node.paramChild) {
          node.paramChild = new RouteNode(seg);
          node.paramName = name;
        }
        node = node.paramChild;
        continue;
      }

      // Static segment
      let child = node.children.get(seg);
      if (!child) {
        child = new RouteNode(seg);
        node.children.set(seg, child);
      }
      node = child;
    }

    node.data = data;
  }

  /**
   * Look up a path. Returns match with params, or null.
   * @param {string} path
   * @returns {{ data: any, params: Object<string, string> } | null}
   */
  lookup(path) {
    const segments = splitPath(path);
    /** @type {Object<string, string>} */
    const params = Object.create(null);

    const result = this.#match(this.#root, segments, 0, params);
    return result;
  }

  /**
   * Recursive matching with backtracking.
   * Priority: static > param > wildcard.
   * @param {RouteNode} node
   * @param {string[]} segments
   * @param {number} index
   * @param {Object<string, string>} params
   * @returns {{ data: any, params: Object<string, string> } | null}
   */
  #match(node, segments, index, params) {
    // All segments consumed — check for data on this node
    if (index === segments.length) {
      return node.data !== null ? { data: node.data, params } : null;
    }

    const seg = segments[index];

    // 1. Try static child (highest priority)
    const staticChild = node.children.get(seg);
    if (staticChild) {
      const result = this.#match(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // 2. Try param child
    if (node.paramChild && node.paramName) {
      const prevValue = params[node.paramName];
      params[node.paramName] = seg;

      const result = this.#match(node.paramChild, segments, index + 1, params);
      if (result) return result;

      // Backtrack
      if (prevValue === undefined) {
        delete params[node.paramName];
      } else {
        params[node.paramName] = prevValue;
      }
    }

    // 3. Try wildcard child (lowest priority, consumes rest)
    if (node.wildcardChild && node.wildcardName) {
      params[node.wildcardName] = segments.slice(index).join('/');
      return node.wildcardChild.data !== null
        ? { data: node.wildcardChild.data, params }
        : null;
    }

    return null;
  }
}

/**
 * Split a URL path into segments.
 * @param {string} path
 * @returns {string[]}
 */
function splitPath(path) {
  return path.split('/').filter(Boolean);
}
