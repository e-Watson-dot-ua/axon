/**
 * A single node in the radix trie.
 */
export class RouteNode {
  /** @type {string} */
  segment;
  /** @type {Map<string, RouteNode>} */
  children = new Map();
  /** @type {RouteNode | null} */
  paramChild = null;
  /** @type {string | null} */
  paramName = null;
  /** @type {RouteNode | null} */
  wildcardChild = null;
  /** @type {string | null} */
  wildcardName = null;
  /** @type {any} */
  data = null;

  /** @param {string} segment */
  constructor(segment) {
    this.segment = segment;
  }
}
