import cluster from 'node:cluster';
import os from 'node:os';

/**
 * Launch workers using node:cluster.
 * Auto-restarts crashed workers with exponential backoff.
 * Propagates SIGTERM/SIGINT to workers for graceful shutdown.
 *
 * Workers shut down gracefully: return the app (anything with a `close()`
 * method) or a cleanup function from `workerFn`, and it will be drained on
 * SIGTERM/SIGINT before the worker exits.
 *
 * @param {() => (void | Function | { close: () => any } | Promise<any>)} workerFn
 *   function each worker executes; its return value controls graceful shutdown
 * @param {Object} [opts]
 * @param {number} [opts.workers] - number of workers (default: available CPUs)
 * @param {number} [opts.maxRestartDelay] - max backoff ms (default: 30000)
 */
export function launch(workerFn, opts = {}) {
  const numWorkers = opts.workers ?? os.availableParallelism?.() ?? os.cpus().length;
  const maxDelay = opts.maxRestartDelay ?? 30_000;

  if (cluster.isPrimary) {
    // cluster.fork() always allocates a fresh worker id, so per-id tracking can
    // never escalate (and leaks an entry per dead worker). Track a single
    // consecutive-crash counter that resets once the fleet has been stable.
    let consecutiveCrashes = 0;
    let lastCrashAt = 0;
    let shuttingDown = false;

    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      if (shuttingDown) return;

      const now = Date.now();
      if (now - lastCrashAt > maxDelay) consecutiveCrashes = 0;
      lastCrashAt = now;
      consecutiveCrashes++;

      const delay = Math.min(1000 * Math.pow(2, consecutiveCrashes - 1), maxDelay);

      // eslint-disable-next-line no-console
      console.error(
        `Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). ` +
        `Restarting in ${delay}ms...`,
      );

      setTimeout(() => {
        if (!shuttingDown) cluster.fork();
      }, delay);
    });

    const shutdown = () => {
      shuttingDown = true;
      for (const id in cluster.workers) {
        cluster.workers[id]?.process.kill('SIGTERM');
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } else {
    // Worker: run the app, then drain it gracefully when the primary signals.
    Promise.resolve(workerFn()).then((result) => {
      /** @type {(() => any) | null} */
      let close = null;
      if (typeof result === 'function') close = result;
      else if (result && typeof result.close === 'function') close = () => result.close();
      if (!close) return;

      let draining = false;
      const drain = () => {
        if (draining) return;
        draining = true;
        Promise.resolve(close()).finally(() => process.exit(0));
      };
      process.once('SIGTERM', drain);
      process.once('SIGINT', drain);
    });
  }
}
