/**
 * Minimal fallback logger used when @e-watson/axon-logger is not installed.
 * Provides the same interface but outputs plain text to console.
 */

/** @type {Record<string, number>} */
const LEVELS = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10, silent: 100 };

export class Logger {
  /** @type {number} */
  #level;
  /** @type {Object<string, any>} */
  #base;

  /** @param {Object} [opts] */
  constructor(opts = {}) {
    this.#level = LEVELS[opts.level ?? 'info'] ?? 30;
    this.#base = opts.base ?? {};
  }

  /**
   * @param {Object<string, any>} fields
   * @returns {Logger}
   */
  child(fields) {
    const child = new Logger();
    child.#level = this.#level;
    child.#base = { ...this.#base, ...fields };
    return child;
  }

  /** @param {string} msg @param {Object} [extra] */
  fatal(msg, extra) { this.#log('fatal', msg, extra); }
  /** @param {string} msg @param {Object} [extra] */
  error(msg, extra) { this.#log('error', msg, extra); }
  /** @param {string} msg @param {Object} [extra] */
  warn(msg, extra) { this.#log('warn', msg, extra); }
  /** @param {string} msg @param {Object} [extra] */
  info(msg, extra) { this.#log('info', msg, extra); }
  /** @param {string} msg @param {Object} [extra] */
  debug(msg, extra) { this.#log('debug', msg, extra); }
  /** @param {string} msg @param {Object} [extra] */
  trace(msg, extra) { this.#log('trace', msg, extra); }

  /** @param {string} label */
  time(label) { this._timers = this._timers ?? {}; this._timers[label] = performance.now(); }
  /** @param {string} label @param {string} [level] */
  timeEnd(label, level = 'info') {
    const start = this._timers?.[label];
    if (start === undefined) return;
    delete this._timers[label];
    this.#log(level, label, { ms: parseFloat((performance.now() - start).toFixed(2)) });
  }

  get level() {
    for (const [name, val] of Object.entries(LEVELS)) {
      if (val === this.#level) return name;
    }
    return 'info';
  }

  /**
   * @param {string} level
   * @param {string} msg
   * @param {Object} [extra]
   */
  #log(level, msg, extra) {
    const numLevel = LEVELS[level] ?? 30;
    if (numLevel < this.#level) return;

    const fields = { ...this.#base, ...extra };
    const keys = Object.keys(fields);
    const suffix = keys.length > 0
      ? ' ' + keys.map((k) => `${k}=${JSON.stringify(fields[k])}`).join(' ')
      : '';

    const line = `[${level.toUpperCase()}] ${msg}${suffix}\n`;
    if (numLevel >= LEVELS.error) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }
}
