import http from 'node:http';
import { Ctx } from './context.js';
import { Router } from './router/router.js';
import { compose } from './middleware/compose.js';
import { HookRegistry } from './lifecycle/hooks.js';
import { runHooks } from './lifecycle/pipeline.js';
import { parseBody } from './parsers/body.parser.js';
import { Validator } from './validation/validator.js';
import { createStaticHandler } from './static/static.handler.js';

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
    const { port = 0, host = '0.0.0.0' } = opts;

    const server = http.createServer((req, res) => this.#handleRequest(req, res));
    this.#server = server;

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
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve, reject) => {
      if (!this.#server) {
        resolve();
        return;
      }
      this.#server.close((err) => (err ? reject(err) : resolve()));
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
    const ctx = new Ctx(req, res);

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
