/**
 * Compose an array of middleware functions into a single function.
 * Follows the onion model — each middleware can run code before and after `next()`.
 *
 * @param {import('../types.js').MiddlewareFn[]} fns
 * @returns {(ctx: import('../types.js').Ctx, next?: () => Promise<void>) => Promise<void>}
 */
export function compose(fns) {
  return function composed(ctx, finalNext) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;

      const fn = i < fns.length ? fns[i] : finalNext;
      if (!fn) return Promise.resolve();

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}
