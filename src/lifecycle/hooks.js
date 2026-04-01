/**
 * Valid lifecycle hook names.
 * @typedef {'onRequest' | 'preParsing' | 'preValidation' | 'preHandler' | 'preSerialization' | 'onSend' | 'onResponse' | 'onError'} HookName
 */

const VALID_HOOKS = new Set([
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend',
  'onResponse',
  'onError',
]);

/**
 * Registry for lifecycle hooks.
 */
export class HookRegistry {
  /** @type {Map<string, Function[]>} */
  #hooks = new Map();

  constructor() {
    for (const name of VALID_HOOKS) {
      this.#hooks.set(name, []);
    }
  }

  /**
   * Add a hook function.
   * @param {string} name
   * @param {Function} fn
   */
  add(name, fn) {
    const list = this.#hooks.get(name);
    if (!list) {
      throw new Error(`Unknown hook: "${name}". Valid hooks: ${[...VALID_HOOKS].join(', ')}`);
    }
    list.push(fn);
  }

  /**
   * Get all hooks for a given name.
   * @param {string} name
   * @returns {Function[]}
   */
  get(name) {
    return this.#hooks.get(name) ?? [];
  }
}
