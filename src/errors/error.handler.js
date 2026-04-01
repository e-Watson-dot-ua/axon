/**
 * Default error handler. Used when no onError hooks are registered.
 *
 * @param {any} err
 * @param {import('../context.js').Ctx} ctx
 */
export function defaultErrorHandler(err, ctx) {
  if (ctx.sent) return;

  const statusCode = err?.statusCode ?? 500;
  const message = err?.message ?? 'Internal Server Error';
  ctx.status(statusCode).send({ error: message });
}
