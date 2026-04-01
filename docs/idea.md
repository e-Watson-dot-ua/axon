# Axon — Lightweight HTTP Framework for Node.js

## Vision

Axon is a minimal, zero-dependency HTTP framework built entirely on native Node.js APIs.
It targets Node.js >= 18 and provides a structured, composable pipeline for handling
HTTP requests — inspired by Fastify's lifecycle and Express's simplicity, but without
the baggage of external packages.

## Constraints

- **Zero runtime dependencies** — only `node:*` built-in modules
- **ESM-only** — no CommonJS fallback
- **Node.js >= 18** — leverages modern APIs (`structuredClone`, `Response`, `URL`, etc.)
- **No TypeScript compilation** — ship plain JS; provide JSDoc types for IDE support

## Core Concepts

### 1. Application (`Axon`)

The top-level object that owns the HTTP server, the router, the middleware stack,
and the lifecycle hooks.

```js
import { createApp } from '@e-watson/axon';

const app = createApp();

app.get('/hello', (ctx) => {
  ctx.send({ message: 'Hello Axon' });
});

app.listen({ port: 3000 });
```

**Builder pattern** — every config method returns `this`, enabling chaining.

### 2. Request Lifecycle (Pipeline Pattern)

Every incoming request flows through an ordered pipeline of hooks. Each hook is a
queue of async functions executed in insertion order.

```
Incoming Request
  |
  v
[onRequest]        — earliest access, connection-level work (logging, rate-limit)
  |
  v
[preParsing]       — transform raw stream before body parsing
  |
  v
[parse]            — built-in body parser (JSON, text, URL-encoded, raw)
  |
  v
[preValidation]    — mutate parsed body before validation
  |
  v
[validate]         — schema validation (if schema attached to route)
  |
  v
[preHandler]       — last hook before the route handler (auth, ACL)
  |
  v
[handler]          — user route handler
  |
  v
[preSerialization] — transform response payload before serialization
  |
  v
[onSend]           — modify serialized response / headers just before writing
  |
  v
[onResponse]       — fires after response is sent (metrics, cleanup)

  --- on error at any stage ---

[onError]          — centralized error hook
```

### 3. Context (`Ctx`)

A per-request object that wraps `node:http.IncomingMessage` and
`node:http.ServerResponse` and exposes a clean API.

| Property / Method    | Description                                   |
|----------------------|-----------------------------------------------|
| `ctx.req`            | Raw `IncomingMessage`                         |
| `ctx.res`            | Raw `ServerResponse`                          |
| `ctx.method`         | HTTP method (uppercase)                       |
| `ctx.url`            | Parsed `URL` object                           |
| `ctx.path`           | Pathname string                               |
| `ctx.query`          | `URLSearchParams` as plain object             |
| `ctx.params`         | Route params (`{ id: '42' }`)                 |
| `ctx.headers`        | Request headers (lower-cased keys)            |
| `ctx.body`           | Parsed request body (set after `parse` phase) |
| `ctx.state`          | Mutable bag for cross-middleware data sharing  |
| `ctx.status(code)`   | Set response status code                      |
| `ctx.header(k, v)`   | Set a response header                         |
| `ctx.send(data)`     | Send JSON / string / Buffer response          |
| `ctx.redirect(url)`  | 302 redirect                                  |
| `ctx.stream(readable)` | Pipe a readable stream                      |

### 4. Router (Radix Trie)

A **radix-trie** router for fast, allocation-light path matching.

- Static segments: `/users/list`
- Named params: `/users/:id`
- Wildcard: `/files/*path`
- Method-based storage — each HTTP method is a separate trie

```js
app.get('/users/:id', handler);
app.post('/users', handler);
app.all('/health', handler);
```

**Route grouping** via `app.group(prefix, callback)`:

```js
app.group('/api/v1', (group) => {
  group.get('/users', listUsers);
  group.get('/users/:id', getUser);
});
```

### 5. Middleware (Chain of Responsibility)

Two scopes of middleware:

- **Global** — runs on every request (`app.use(fn)`)
- **Route-level** — runs only on matched route (`app.get('/x', mw1, mw2, handler)`)

Middleware signature:

```js
async function logger(ctx, next) {
  const start = performance.now();
  await next();
  const ms = performance.now() - start;
  console.log(`${ctx.method} ${ctx.path} — ${ms.toFixed(1)}ms`);
}
```

`next()` delegates to the next function in the chain. Not calling `next()` short-circuits.

### 6. Schema Validation (Strategy Pattern)

Routes can declare a schema. The **strategy pattern** lets users swap
the validation engine.

```js
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name:  { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
      },
    },
    query: { /* ... */ },
    params: { /* ... */ },
  },
  handler(ctx) {
    ctx.send({ ok: true });
  },
});
```

A built-in lightweight validator covers common cases (type, required, minLength,
maxLength, min, max, pattern, enum, format). Users can replace it:

```js
app.setValidator(myCustomValidator);
```

### 7. Body Parser

Built-in parsers selected by `Content-Type`:

| Content-Type                        | Parser        |
|-------------------------------------|---------------|
| `application/json`                  | JSON          |
| `text/plain`                        | Text (UTF-8)  |
| `application/x-www-form-urlencoded` | URL-encoded   |
| _anything else_                     | Raw `Buffer`  |

Configurable body size limit (default: 1 MiB). Parsing is lazy — body is only
read when a route declares it needs one or `ctx.body` is accessed.

### 8. Error Handling (Observer Pattern)

Unhandled errors and explicit `throw` inside handlers/hooks are caught and
routed through `onError` hooks.

```js
app.onError((err, ctx) => {
  ctx.status(err.statusCode ?? 500);
  ctx.send({ error: err.message });
});
```

`HttpError` is a built-in class:

```js
import { HttpError } from '@e-watson/axon';
throw new HttpError(404, 'User not found');
```

### 9. Plugins (Decorator Pattern)

Plugins extend the app or context without subclassing.

```js
function corsPlugin(app, opts) {
  app.onSend((ctx) => {
    ctx.header('Access-Control-Allow-Origin', opts.origin ?? '*');
  });
}

app.register(corsPlugin, { origin: 'https://example.com' });
```

`app.decorate(name, value)` adds properties to the app instance.
`app.decorateCtx(name, value)` adds properties to every `Ctx`.

### 10. Static File Serving

An optional built-in utility that streams files from a directory using
`node:fs` readable streams, with:

- ETag / Last-Modified headers
- MIME type detection (small built-in map)
- Range requests (partial content)
- Directory index (`index.html`)
- Cross-platform safe path resolution (`node:path.resolve` + traversal guard)

```js
app.static('/public', './static');
```

## Design Patterns Summary

| Pattern                | Where                                        |
|------------------------|----------------------------------------------|
| **Builder**            | App config / route definition chaining       |
| **Chain of Responsibility** | Middleware pipeline                    |
| **Pipeline**           | Request lifecycle hooks                      |
| **Strategy**           | Swappable validator, serializer              |
| **Decorator**          | Plugin system (`decorate`, `decorateCtx`)    |
| **Observer**           | Error hooks, `onResponse` events             |
| **Radix Trie**         | Router path matching                         |
| **Factory**            | `createApp()` entry point                    |

## Project Structure

```
src/
  index.js                  — public API re-exports
  app.js                    — Axon application class
  context.js                — Ctx (request context)
  router/
    router.js               — Router facade
    radix.trie.js           — Radix trie implementation
    route.node.js           — Trie node
  lifecycle/
    pipeline.js             — Hook pipeline runner
    hooks.js                — Hook registry
  middleware/
    compose.js              — Middleware composition (chain of responsibility)
  parsers/
    body.parser.js          — Body parser dispatcher
    json.parser.js          — JSON parser
    text.parser.js          — Text parser
    urlencoded.parser.js    — URL-encoded form parser
  validation/
    validator.js            — Validation strategy interface
    schema.validator.js     — Built-in schema validator
  errors/
    http.error.js           — HttpError class
    error.handler.js        — Default error handler
  plugins/
    plugin.loader.js        — Plugin registration logic
  static/
    static.handler.js       — Static file serving
    mime.map.js             — MIME type lookup
  utils/
    header.utils.js         — Header manipulation helpers
    stream.utils.js         — Stream helpers (collect body, pipe)
    url.utils.js            — URL / query parsing
```

### 11. Production Features

These are built-in capabilities that make Axon usable in real deployments:

- **Graceful shutdown** — drain in-flight requests on `SIGTERM`/`SIGINT`
- **Request timeout** — configurable per-request timeout (default 30 s), 408 on expiry
- **Request ID** — auto-generated `X-Request-Id` via `crypto.randomUUID()`, passthrough-aware
- **Proxy trust** — `X-Forwarded-*` header parsing when behind a reverse proxy
- **Security headers** — opt-in plugin for HSTS, CSP, X-Content-Type-Options, etc.
- **CORS** — built-in plugin with preflight handling
- **Compression** — gzip/deflate via `node:zlib`, negotiated by `Accept-Encoding`
- **Cookies** — parse `Cookie` header, build `Set-Cookie` with full option support
- **Structured logging** — JSON-line logger with levels, request ID, swappable implementation
- **Rate limiting** — in-memory token-bucket per IP (single-process)
- **Keep-alive tuning** — configurable timeouts and connection limits
- **Cluster mode** — optional `node:cluster` launcher with auto-restart

## Public API Surface

```js
// Named exports from package entry point
export {
  createApp,       // Factory — returns new Axon instance
  HttpError,       // Error class with statusCode
  definePlugin,    // Plugin helper (optional wrapper)
};
```
