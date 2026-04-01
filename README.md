# Axon

Minimal, zero-dependency HTTP framework for Node.js.

Axon provides a structured request pipeline — routing, middleware, lifecycle hooks,
body parsing, validation, and plugin support — using only native Node.js APIs.
No external packages. No build step. Just JavaScript.

## Features

- **Radix-trie router** — fast path matching with named params and wildcards
- **Lifecycle hooks** — 10-stage request pipeline (onRequest through onResponse)
- **Middleware** — global and route-level, onion-model composition
- **Body parsing** — JSON, text, URL-encoded, raw buffer (built-in)
- **Schema validation** — lightweight built-in validator, swappable via strategy pattern
- **Plugin system** — extend app and context with decorators
- **Static file serving** — streaming, ETag, MIME detection
- **Error handling** — `HttpError` class, `onError` hooks, safe defaults
- **Production ready** — graceful shutdown, request timeout, compression, CORS,
  security headers, structured logging, rate limiting, cluster mode
- **Cross-platform** — works on Windows, Linux, and macOS

## Requirements

- Node.js >= 18.0.0

## Install

```bash
npm install @e-watson/axon
```

## Quick Start

```js
import { createApp } from '@e-watson/axon';

const app = createApp();

// Middleware
app.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  ctx.header('X-Response-Time', `${ms}ms`);
});

// Routes
app.get('/', (ctx) => {
  ctx.send({ message: 'Hello Axon' });
});

app.get('/users/:id', (ctx) => {
  ctx.send({ id: ctx.params.id });
});

// Route groups
app.group('/api/v1', (group) => {
  group.get('/health', (ctx) => ctx.send({ status: 'ok' }));
});

// Start
app.listen({ port: 3000 }).then(({ port }) => {
  console.log(`Listening on http://localhost:${port}`);
});
```

## API Overview

### Application

```js
import { createApp } from '@e-watson/axon';

const app = createApp();

app.get(path, ...middleware, handler);
app.post(path, ...middleware, handler);
app.put(path, ...middleware, handler);
app.delete(path, ...middleware, handler);
app.patch(path, ...middleware, handler);
app.all(path, ...middleware, handler);

app.use(middleware);                   // Global middleware
app.group(prefix, callback);          // Route grouping
app.addHook(name, fn);                // Lifecycle hook
app.onError(fn);                      // Error handler

app.register(plugin, opts);           // Plugin registration
app.decorate(name, value);            // Extend app instance
app.decorateCtx(name, value);         // Extend request context

app.listen({ port, host, signal });   // Start server
app.close();                          // Graceful shutdown
```

### Context (`ctx`)

```js
ctx.req                // Raw IncomingMessage
ctx.res                // Raw ServerResponse
ctx.method             // HTTP method
ctx.path               // Pathname
ctx.query              // Parsed query params
ctx.params             // Route params
ctx.headers            // Request headers
ctx.body               // Parsed request body
ctx.state              // Cross-middleware data bag
ctx.id                 // Request ID

ctx.status(code)       // Set status code
ctx.header(key, value) // Set response header
ctx.send(data)         // Send response (auto-serializes)
ctx.redirect(url)      // 302 redirect
ctx.stream(readable)   // Pipe a stream
ctx.setCookie(name, value, opts)
ctx.cookies            // Parsed request cookies
ctx.log                // Request-scoped logger
```

### Error Handling

```js
import { HttpError } from '@e-watson/axon';

app.get('/users/:id', (ctx) => {
  throw new HttpError(404, 'User not found');
});

app.onError((err, ctx) => {
  ctx.status(err.statusCode ?? 500);
  ctx.send({ error: err.message });
});
```

### Route Schemas

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
  },
  handler(ctx) {
    ctx.send({ created: true });
  },
});
```

### Plugins

```js
import { createApp } from '@e-watson/axon';

function myPlugin(app, opts) {
  app.decorate('db', createDbConnection(opts));
  app.addHook('onRequest', async (ctx) => {
    ctx.state.startTime = Date.now();
  });
}

const app = createApp();
app.register(myPlugin, { connectionString: '...' });
```

## Documentation

- [Design Document](docs/idea.md) — architecture, patterns, and project structure
- [Development Plan](docs/dev.plan.md) — step-by-step implementation roadmap

## License

[MIT](LICENSE)
