const LEVELS = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };

const isTTY = process.stdout.isTTY ?? false;

// ANSI color codes
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  red: isTTY ? '\x1b[31m' : '',
  redBg: isTTY ? '\x1b[41m\x1b[97m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  green: isTTY ? '\x1b[32m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  gray: isTTY ? '\x1b[90m' : '',
  white: isTTY ? '\x1b[37m' : '',
};

/** @type {Record<string, { color: string, symbol: string, label: string }>} */
const LEVEL_STYLE = {
  fatal: { color: c.redBg, symbol: '\u2716', label: 'FTL' },   // ✖
  error: { color: c.red, symbol: '\u2718', label: 'ERR' },      // ✘
  warn:  { color: c.yellow, symbol: '\u25B2', label: 'WRN' },   // ▲
  info:  { color: c.green, symbol: '\u25CF', label: 'INF' },    // ●
  debug: { color: c.cyan, symbol: '\u25CB', label: 'DBG' },     // ○
  trace: { color: c.magenta, symbol: '\u2508', label: 'TRC' },  // ┈
};

/**
 * Lightweight structured logger with colored TTY output.
 *
 * - When stdout is a TTY: human-readable colored lines with symbols
 * - When piped / redirected: JSON lines (machine-readable)
 */
export class Logger {
  /** @type {number} */
  #level;
  /** @type {Object<string, any>} */
  #base;
  /** @type {boolean} */
  #pretty;

  /**
   * @param {Object} [opts]
   * @param {'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'} [opts.level]
   * @param {Object<string, any>} [opts.base] extra fields on every log line
   * @param {boolean} [opts.pretty] force pretty mode (default: auto-detect TTY)
   */
  constructor(opts = {}) {
    this.#level = LEVELS[opts.level ?? 'info'] ?? 30;
    this.#base = opts.base ?? {};
    this.#pretty = opts.pretty ?? isTTY;
  }

  /**
   * Create a child logger with extra fields.
   * @param {Object<string, any>} fields
   * @returns {Logger}
   */
  child(fields) {
    const logger = new Logger({ pretty: this.#pretty });
    logger.#level = this.#level;
    logger.#base = { ...this.#base, ...fields };
    return logger;
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

  /**
   * @param {string} level
   * @param {string} msg
   * @param {Object} [extra]
   */
  #log(level, msg, extra) {
    const numLevel = LEVELS[level] ?? 30;
    if (numLevel < this.#level) return;

    const out = numLevel >= LEVELS.error ? process.stderr : process.stdout;

    if (this.#pretty) {
      out.write(this.#formatPretty(level, msg, extra));
    } else {
      out.write(this.#formatJson(level, msg, extra));
    }
  }

  /**
   * @param {string} level
   * @param {string} msg
   * @param {Object} [extra]
   * @returns {string}
   */
  #formatPretty(level, msg, extra) {
    const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.info;
    const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS

    let line = `${c.dim}${ts}${c.reset} ${style.color}${style.symbol} ${style.label}${c.reset} ${c.bold}${msg}${c.reset}`;

    // Append base + extra fields as dim key=value pairs
    const fields = { ...this.#base, ...extra };
    const keys = Object.keys(fields);
    if (keys.length > 0) {
      const pairs = keys.map((k) => `${c.dim}${k}${c.reset}${c.gray}=${c.reset}${formatValue(fields[k])}`);
      line += ` ${c.gray}\u2502${c.reset} ${pairs.join(' ')}`;
    }

    return line + '\n';
  }

  /**
   * @param {string} level
   * @param {string} msg
   * @param {Object} [extra]
   * @returns {string}
   */
  #formatJson(level, msg, extra) {
    const entry = {
      level,
      time: new Date().toISOString(),
      ...this.#base,
      msg,
      ...extra,
    };
    return JSON.stringify(entry) + '\n';
  }
}

/**
 * Format a value for pretty output.
 * @param {any} val
 * @returns {string}
 */
function formatValue(val) {
  if (typeof val === 'string') return `${c.green}${val}${c.reset}`;
  if (typeof val === 'number') return `${c.yellow}${val}${c.reset}`;
  if (typeof val === 'boolean') return `${c.cyan}${val}${c.reset}`;
  if (val === null || val === undefined) return `${c.dim}${val}${c.reset}`;
  return `${c.gray}${JSON.stringify(val)}${c.reset}`;
}
