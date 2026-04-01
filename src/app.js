import http from 'node:http';
import { Ctx } from './context.js';
import { Router } from './router/router.js';
import { compose } from './middleware/compose.js';
import { HookRegistry } from './lifecycle/hooks.js';
import { runHooks } from './lifecycle/pipeline.js';
import { parseBody } from './parsers/body.parser.js';
import { Validator } from './validation/validator.js';
import { createStaticHandler } from './static/static.handler.js';
import { Logger as FallbackLogger } from './utils/logger.js';

/** @type {typeof FallbackLogger} */
let Logger = FallbackLogger;
try {
  const mod = await import('@e-watson/axon-logger');
  if (mod.Logger) Logger = mod.Logger;
} catch {
  // @e-watson/axon-logger not installed — use built-in fallback
}

export class Axon {
  /** @type {http.Server | null} */
  #server = null;
  #router = new Router();
  /** @type {import('./types.js').MiddlewareFn[]} */
  #middleware = [];
  #hooks = new HookRegistry();
  /** @type {{ limit?: number }} */
  #bodyOpts = {};
  #validator = new Validator();
  /** @type {Map<string, any>} */
  #settings = new Map();
  /** @type {Set<import('node:http').ServerResponse>} */
  #activeResponses = new Set();
  #defaultLogger = new Logger({ level: 'info' });

  /**
   * Register a GET route.
   * @param {string} path
   * @param {...import('./types.js').HandlerFn} handlers
   * @returns {this}
   */
  get(path, ...handlers) {
    return this.#addRoute('GET', path, handlers);
  }

  /**
   * Register a POST route.
   * @param {string} path
   * @param {...import('./types.js').HandlerFn} handlers
   * @returns {this}
   */
  post(path, ...handlers) {
    return this.#addRoute('POST', path, handlers);
  }

  /**
   * Register a PUT route.
   * @param {string} path
   * @param {...import('./types.js').HandlerFn} handlers
   * @returns {this}
   */
  put(path, ...handlers) {
    return this.#addRoute('PUT', path, handlers);
  }

  /**
   * Register a DELETE route.
   * @param {string} path
   * @param {...import('./types.js').HandlerFn} handlers
   * @returns {this}
   */
  delete(path, ...handlers) {
    return this.#addRoute('DELETE', path, handlers);
  }

  /**
   * Register a PATCH route.
   * @param {string} path
   * @param {...import('./types.js').HandlerFn} handlers
   * @returns {this}
   */
  patch(path, ...handlers) {
    return this.#addRoute('PATCH', path, handlers);
  }

  /**
   * Register a route for all HTTP methods.
   * @param {string} path
   * @param {...import('./types.js').HandlerFn} handlers
   * @returns {this}
   */
  all(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.addAll(path, { handler, middleware });
    return this;
  }

  /**
   * Set a configuration value.
   * @param {string} key
   * @param {any} value
   * @returns {this}
   */
  set(key, value) {
    this.#settings.set(key, value);
    return this;
  }

  /**
   * Get a configuration value.
   * @param {string} key
   * @returns {any}
   */
  setting(key) {
    return this.#settings.get(key);
  }

  /**
   * Register global middleware.
   * @param {import('./types.js').MiddlewareFn} fn
   * @returns {this}
   */
  use(fn) {
    this.#middleware.push(fn);
    return this;
  }

  /**
   * Register a lifecycle hook.
   * @param {string} name
   * @param {Function} fn
   * @returns {this}
   */
  addHook(name, fn) {
    this.#hooks.add(name, fn);
    return this;
  }

  /**
   * Replace the validation function.
   * @param {(value: any, schema: any) => { valid: boolean, errors: string[] }} fn
   * @returns {this}
   */
  setValidator(fn) {
    this.#validator.setValidator(fn);
    return this;
  }

  /**
   * Register an error handler hook.
   * @param {import('./types.js').ErrorHandlerFn} fn
   * @returns {this}
   */
  onError(fn) {
    this.#hooks.add('onError', fn);
    return this;
  }

  /**
   * Decorate the app instance with a custom property.
   * @param {string} name
   * @param {any} value
   * @returns {this}
   */
  decorate(name, value) {
    if (name in this) {
      throw new Error(`Decorator "${name}" already exists on app`);
    }
    /** @type {any} */ (this)[name] = value;
    return this;
  }

  /**
   * Decorate every new Ctx with a custom property.
   * @param {string} name
   * @param {any} value
   * @returns {this}
   */
  decorateCtx(name, value) {
    if (name in Ctx.prototype) {
      throw new Error(`Decorator "${name}" already exists on Ctx`);
    }
    /** @type {any} */ (Ctx.prototype)[name] = value;
    return this;
  }

  /**
   * Register a plugin.
   * @param {(app: Axon, opts?: any) => void} pluginFn
   * @param {any} [opts]
   * @returns {this}
   */
  register(pluginFn, opts) {
    pluginFn(this, opts);
    return this;
  }

  /**
   * Serve static files from a directory.
   * @param {string} urlPrefix - URL path prefix (e.g. '/public')
   * @param {string} dirPath - filesystem directory path
   * @param {Object} [opts]
   * @param {string} [opts.index] - index file (default: 'index.html')
   * @returns {this}
   */
  static(urlPrefix, dirPath, opts) {
    const prefix = urlPrefix.replace(/\/+$/, '');
    const handler = createStaticHandler(dirPath, opts);
    this.#router.add('GET', `${prefix}/*path`, { handler, middleware: [] });
    return this;
  }

  /**
   * Create a route group with a shared prefix.
   * @param {string} prefix
   * @param {(group: RouteGroup) => void} callback
   * @returns {this}
   */
  group(prefix, callback) {
    const grp = new RouteGroup(prefix, this.#router);
    callback(grp);
    return this;
  }

  /**
   * Start listening for HTTP requests.
   * @param {import('./types.js').ListenOptions} [opts]
   * @returns {Promise<import('./types.js').ListenResult>}
   */
  listen(opts = {}) {
    const {
      port = 0,
      host = '0.0.0.0',
      signal,
      keepAliveTimeout = 72_000,
      headersTimeout = 60_000,
      requestTimeout = 30_000,
    } = opts;

    this.#settings.set('requestTimeout', requestTimeout);

    const server = http.createServer((req, res) => this.#handleRequest(req, res));
    this.#server = server;

    // Keep-alive tuning
    server.keepAliveTimeout = keepAliveTimeout;
    server.headersTimeout = headersTimeout;

    // AbortSignal support for programmatic shutdown
    if (signal) {
      if (signal.aborted) {
        this.close();
      } else {
        signal.addEventListener('abort', () => this.close(), { once: true });
      }
    }

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        const addr = server.address();
        resolve({
          address: typeof addr === 'string' ? addr : addr?.address ?? host,
          port: typeof addr === 'string' ? 0 : addr?.port ?? 0,
        });
      });
    });
  }

  /**
   * Gracefully close the server.
   * Stops accepting new connections, waits for in-flight requests to drain,
   * then force-closes after the shutdown timeout.
   *
   * @param {Object} [opts]
   * @param {number} [opts.timeout] ms to wait before force-closing (default 30000)
   * @returns {Promise<void>}
   */
  close(opts = {}) {
    const timeout = opts.timeout ?? 30_000;

    return new Promise((resolve, reject) => {
      if (!this.#server) {
        resolve();
        return;
      }

      const server = this.#server;
      this.#server = null;

      // Close idle keep-alive connections, let in-flight finish
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }

      // Stop accepting new connections
      server.close((err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });

      // Force-close after timeout
      const timer = setTimeout(() => {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        for (const res of this.#activeResponses) {
          res.destroy();
        }
        this.#activeResponses.clear();
      }, timeout);

      // Don't keep the process alive just for the timer
      if (timer.unref) timer.unref();
    });
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {Array<Function | Object>} handlers
   * @returns {this}
   */
  #addRoute(method, path, handlers) {
    const last = handlers[handlers.length - 1];

    // Support object-style route definition: { schema, handler }
    if (typeof last === 'object' && last !== null && 'handler' in last) {
      const routeDef = /** @type {{ handler: Function, schema?: any }} */ (last);
      const middleware = handlers.slice(0, -1);
      this.#router.add(method, path, { handler: routeDef.handler, middleware, schema: routeDef.schema });
      return this;
    }

    const handler = last;
    const middleware = handlers.slice(0, -1);
    this.#router.add(method, path, { handler, middleware });
    return this;
  }

  /**
   * Handle an incoming request.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async #handleRequest(req, res) {
    // Track active responses for graceful shutdown
    this.#activeResponses.add(res);
    res.on('close', () => this.#activeResponses.delete(res));

    // Request timeout
    const timeout = this.#settings.get('requestTimeout') ?? 30_000;
    let timer = null;
    if (timeout > 0) {
      timer = setTimeout(() => {
        if (!res.writableEnded) {
          const ctx = new Ctx(req, res);
          ctx.status(408).send({ error: 'Request Timeout' });
        }
      }, timeout);
      if (timer.unref) timer.unref();
    }

    const trustProxy = this.#settings.get('trustProxy') ?? false;
    const ctx = new Ctx(req, res, { trustProxy });

    // Set request ID header
    ctx.header('X-Request-Id', ctx.id);

    // Attach request-scoped logger
    const appLogger = this.#settings.get('logger') ?? this.#defaultLogger;
    ctx.log = appLogger.child({ reqId: ctx.id });

    try {
      // 1. onRequest
      await runHooks(this.#hooks.get('onRequest'), ctx);
      if (ctx.sent) return;

      // 2. Global middleware wraps the route dispatch
      const globalChain = compose(this.#middleware);

      await globalChain(ctx, async () => {
        // 3. preParsing
        await runHooks(this.#hooks.get('preParsing'), ctx);
        if (ctx.sent) return;

        // 4. parse phase — body parsing
        if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
          ctx.body = await parseBody(ctx.req, this.#bodyOpts);
        }

        // 5. preValidation
        await runHooks(this.#hooks.get('preValidation'), ctx);
        if (ctx.sent) return;

        const match = this.#router.find(ctx.method ?? 'GET', ctx.path);

        if (!match) {
          ctx.status(404).send({ error: 'Not Found' });
          return;
        }

        ctx.params = match.data.params ?? {};
        Object.assign(ctx.params, match.params);

        // 6. validate phase
        if (match.data.schema) {
          this.#validator.validate(
            { body: ctx.body, query: ctx.query, params: ctx.params },
            match.data.schema,
          );
        }

        // 7. preHandler
        await runHooks(this.#hooks.get('preHandler'), ctx);
        if (ctx.sent) return;

        // 8. Route-level middleware + handler
        const routeChain = compose([...(match.data.middleware ?? []), match.data.handler]);
        await routeChain(ctx);

        // 9. preSerialization — will be fully wired in Phase 9
        await runHooks(this.#hooks.get('preSerialization'), ctx);

        // 10. onSend
        await runHooks(this.#hooks.get('onSend'), ctx);
      });

      // If nothing sent a response, send 404
      if (!ctx.sent) {
        ctx.status(404).send({ error: 'Not Found' });
      }

      // 11. onResponse (always fires after response)
      await runHooks(this.#hooks.get('onResponse'), ctx);
    } catch (/** @type {any} */ err) {
      await this.#handleError(err, ctx);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * @param {any} err
   * @param {Ctx} ctx
   */
  async #handleError(err, ctx) {
    const errorHooks = this.#hooks.get('onError');

    if (errorHooks.length > 0) {
      try {
        await runHooks(errorHooks, err, ctx);
        return;
      } catch {
        // If error hooks themselves throw, fall through to default
      }
    }

    if (!ctx.sent) {
      const statusCode = err?.statusCode ?? 500;
      const message = err?.message ?? 'Internal Server Error';
      ctx.status(statusCode).send({ error: message });
    }
  }
}

/**
 * Route group — scoped route registration.
 */
class RouteGroup {
  /** @type {string} */
  #prefix;
  /** @type {Router} */
  #router;

  /**
   * @param {string} prefix
   * @param {Router} router
   */
  constructor(prefix, router) {
    this.#prefix = prefix.replace(/\/+$/, '');
    this.#router = router;
  }

  /** @param {string} path */
  #fullPath(path) {
    return this.#prefix + (path.startsWith('/') ? path : '/' + path);
  }

  /**
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  get(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.add('GET', this.#fullPath(path), { handler, middleware });
    return this;
  }

  /**
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  post(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.add('POST', this.#fullPath(path), { handler, middleware });
    return this;
  }

  /**
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  put(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.add('PUT', this.#fullPath(path), { handler, middleware });
    return this;
  }

  /**
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  delete(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.add('DELETE', this.#fullPath(path), { handler, middleware });
    return this;
  }

  /**
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  patch(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.add('PATCH', this.#fullPath(path), { handler, middleware });
    return this;
  }

  /**
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  all(path, ...handlers) {
    const handler = handlers[handlers.length - 1];
    const middleware = handlers.slice(0, -1);
    this.#router.addAll(this.#fullPath(path), { handler, middleware });
    return this;
  }

  /**
   * Nested group.
   * @param {string} prefix
   * @param {(group: RouteGroup) => void} callback
   * @returns {this}
   */
  group(prefix, callback) {
    const nested = new RouteGroup(this.#fullPath(prefix), this.#router);
    callback(nested);
    return this;
  }
}

/**
 * Factory — create a new Axon app.
 * @returns {Axon}
 */
export function createApp() {
  return new Axon();
}
