/**
 * Run an array of async hook functions sequentially.
 * Stops on the first error (throws it).
 *
 * @param {Function[]} hooks
 * @param  {...any} args — arguments passed to each hook
 * @returns {Promise<void>}
 */
export async function runHooks(hooks, ...args) {
  for (const fn of hooks) {
    await fn(...args);
  }
}
