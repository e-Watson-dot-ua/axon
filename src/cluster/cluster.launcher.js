import cluster from 'node:cluster';
import os from 'node:os';

/**
 * Launch workers using node:cluster.
 * Auto-restarts crashed workers with exponential backoff.
 * Propagates SIGTERM/SIGINT to workers for graceful shutdown.
 *
 * @param {() => void} workerFn - function each worker executes
 * @param {Object} [opts]
 * @param {number} [opts.workers] - number of workers (default: available CPUs)
 * @param {number} [opts.maxRestartDelay] - max backoff ms (default: 30000)
 */
export function launch(workerFn, opts = {}) {
  const numWorkers = opts.workers ?? os.availableParallelism?.() ?? os.cpus().length;
  const maxDelay = opts.maxRestartDelay ?? 30_000;

  if (cluster.isPrimary) {
    /** @type {Map<number, number>} */
    const restartCounts = new Map();
    let shuttingDown = false;

    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      if (shuttingDown) return;

      const id = worker.id;
      const count = (restartCounts.get(id) ?? 0) + 1;
      restartCounts.set(id, count);

      const delay = Math.min(1000 * Math.pow(2, count - 1), maxDelay);

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
    workerFn();
  }
}
