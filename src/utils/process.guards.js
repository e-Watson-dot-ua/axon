/**
 * Install last-resort process-level handlers so a stray rejection or thrown
 * error is logged rather than crashing the process silently. Opt-in — call once
 * at startup. When an `app` is supplied, fatal signals/exceptions drain it first.
 *
 * @param {Object} [opts]
 * @param {any} [opts.logger] logger with `error()`; defaults to `console`
 * @param {{ close: (o?: any) => Promise<void> }} [opts.app] app to close gracefully
 * @param {boolean} [opts.exitOnUncaught] exit(1) after uncaughtException (default: true)
 * @param {boolean} [opts.handleSignals] close the app on SIGTERM/SIGINT (default: true when `app` is set)
 * @returns {void}
 */
export function installProcessGuards(opts = {}) {
  const logger = opts.logger ?? console;
  const emit = (/** @type {string} */ msg, /** @type {any} */ err) => {
    const extra = { err: String(err?.stack ?? err) };
    if (typeof logger.error === 'function') logger.error(msg, extra);
    else console.error(msg, extra);
  };

  process.on('unhandledRejection', (reason) => emit('unhandledRejection', reason));

  process.on('uncaughtException', (err) => {
    emit('uncaughtException', err);
    if (opts.exitOnUncaught === false) return;
    process.exitCode = 1;
    if (opts.app) {
      opts.app.close().finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });

  const handleSignals = opts.handleSignals ?? Boolean(opts.app);
  if (handleSignals && opts.app) {
    const shutdown = () => {
      opts.app.close().finally(() => process.exit(0));
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }
}
