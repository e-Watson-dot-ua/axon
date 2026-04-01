# Axon — Development Plan

Each step is an atomic, testable unit of work. Steps are grouped into phases.
Complete each step before moving to the next. Every step that produces code
must include at least one test (using the Node.js built-in test runner).

**Cross-platform rule:** All code, scripts, tests, and file operations must
work identically on Windows, Linux, and macOS. Specifics:
- Use `node:path.join()` / `node:path.resolve()` for all file paths — never
  hardcode `/` or `\\` separators
- Use `node:url.pathToFileURL()` when converting file paths to URLs
- Avoid shell-dependent npm scripts; rely on Node APIs or cross-platform
  Node CLI flags (e.g., `node --test` instead of shell globs)
- Use `node:fs/promises` for all file I/O (consistent async API everywhere)
- Normalize line endings in body parsing (handle `\r\n` and `\n`)
- Static file serving: resolve paths with `path.resolve()` and validate
  against the root directory to prevent traversal on any OS

---

## Phase 0 — Project Scaffolding

### 0.1 Configure Node.js test runner
- Add `"test": "node --test"` to `package.json`
  (Node's built-in test runner recursively discovers `**/*.test.js` files
  without shell glob expansion — works on Windows, Linux, and macOS)
- Create `src/__smoke__.test.js` — a trivial passing test to verify the runner works

### 0.2 Create directory structure
- Create empty placeholder files for every directory listed in `docs/idea.md`
- Ensure `npm test` still passes (no broken imports)

### 0.3 Set up JSDoc / type-checking support
- Add `jsconfig.json` with `checkJs: true` and path aliases
- Add base JSDoc typedefs file `src/types.js` (shared type definitions)

---

## Phase 1 — Core: Context & Minimal Server

### 1.1 Implement `HttpError`
- File: `src/errors/http.error.js`
- Class with `statusCode`, `message`, optional `details`
- Test: construct, verify properties, verify `instanceof Error`

### 1.2 Implement `Ctx` (request context)
- File: `src/context.js`
- Constructor receives `(req, res)`
- Expose: `method`, `url` (parsed URL), `path`, `query`, `headers`, `params`, `state`
- Expose: `status()`, `header()`, `send()`, `redirect()`
- Test: create mock `req`/`res`, verify each getter and method

### 1.3 Implement `createApp` — bare server
- File: `src/app.js`
- Create `Axon` class; `createApp()` factory returns instance
- `listen(opts)` — starts `http.createServer`, returns a `Promise<{ address, port }>`
- `close()` — graceful shutdown
- For now, every request returns 404
- Test: start server, make a request with `fetch`, expect 404, close

### 1.4 Wire `Ctx` into the server
- On each incoming request, create a `Ctx` and pass it through
- Test: start server, make a request, verify response from a hardcoded handler

---

## Phase 2 — Router

### 2.1 Implement radix trie — insert
- File: `src/router/radix.trie.js`
- `insert(path, data)` — handles static segments
- Test: insert several paths, verify internal tree shape

### 2.2 Implement radix trie — lookup
- `lookup(path)` — returns `{ data, params }` or `null`
- Test: lookup static paths, expect correct data

### 2.3 Add named parameter support (`:param`)
- Extend `insert` and `lookup` to handle `/users/:id`
- Test: insert parameterized paths, lookup, verify `params`

### 2.4 Add wildcard support (`*name`)
- Extend `insert` and `lookup` to handle `/files/*path`
- Test: wildcard captures rest of path

### 2.5 Implement `Router` facade
- File: `src/router/router.js`
- Holds one trie per HTTP method
- Methods: `add(method, path, handler)`, `find(method, path)`
- Test: add routes for GET/POST, find them, verify 404 for missing

### 2.6 Integrate router into `Axon`
- Add `app.get()`, `app.post()`, `app.put()`, `app.delete()`, `app.patch()`, `app.all()`
- On request: lookup route, set `ctx.params`, call handler
- Test: register a GET route, make request, expect correct response

### 2.7 Implement route grouping
- `app.group(prefix, callback)` — scoped route registration
- Test: group with prefix, verify routes resolve correctly

---

## Phase 3 — Middleware Pipeline

### 3.1 Implement `compose` (middleware composition)
- File: `src/middleware/compose.js`
- Takes array of `(ctx, next)` functions, returns a single function
- Test: compose three middlewares, verify execution order (onion model)

### 3.2 Add global middleware (`app.use`)
- `app.use(fn)` pushes onto global middleware stack
- On request: run global middleware chain, then route handler
- Test: add logger middleware, verify it runs before handler

### 3.3 Add route-level middleware
- `app.get('/x', mw1, mw2, handler)` — per-route chain
- Test: route middleware runs only on matched route

---

## Phase 4 — Lifecycle Hooks

### 4.1 Implement hook registry
- File: `src/lifecycle/hooks.js`
- Stores arrays of async functions keyed by hook name
- Methods: `addHook(name, fn)`, `getHooks(name)`
- Test: add hooks, retrieve, verify order

### 4.2 Implement pipeline runner
- File: `src/lifecycle/pipeline.js`
- Runs an array of async hooks sequentially; stops on error
- Test: run pipeline of 3 hooks, verify sequential execution

### 4.3 Wire lifecycle into request flow
- Integrate hooks into `Axon` request handling:
  `onRequest` -> `preParsing` -> `parse` -> `preValidation` -> `validate` ->
  `preHandler` -> `handler` -> `preSerialization` -> `onSend` -> `onResponse`
- Add `app.addHook(name, fn)` convenience
- Test: register hooks at each stage, verify order via side effects

---

## Phase 5 — Body Parsing

### 5.1 Implement stream body collector
- File: `src/utils/stream.utils.js`
- `collectBody(req, { limit })` — reads stream into `Buffer`, enforces size limit
- Test: pipe a mock stream, verify collected buffer; exceed limit, expect error

### 5.2 Implement JSON parser
- File: `src/parsers/json.parser.js`
- Parse buffer as JSON, throw on invalid
- Test: valid JSON, invalid JSON

### 5.3 Implement text parser
- File: `src/parsers/text.parser.js`
- Decode buffer as UTF-8 string
- Test: round-trip

### 5.4 Implement URL-encoded parser
- File: `src/parsers/urlencoded.parser.js`
- Parse `key=value&key2=value2` into object
- Test: simple pairs, encoded characters

### 5.5 Implement body parser dispatcher
- File: `src/parsers/body.parser.js`
- Select parser by `Content-Type` header
- Fallback: return raw buffer
- Test: dispatch to correct parser based on content type

### 5.6 Wire body parser into lifecycle (`parse` phase)
- After `preParsing`, run body parser, set `ctx.body`
- Test: POST JSON body, verify `ctx.body` in handler

---

## Phase 6 — Validation

### 6.1 Implement built-in schema validator
- File: `src/validation/schema.validator.js`
- Support: `type`, `required`, `properties`, `minLength`, `maxLength`,
  `min`, `max`, `pattern`, `enum`, `format` (email)
- Test: valid/invalid payloads for each rule

### 6.2 Implement validator strategy interface
- File: `src/validation/validator.js`
- Default: built-in validator
- `app.setValidator(fn)` swaps it out
- Test: swap validator, verify custom one is called

### 6.3 Wire validation into lifecycle (`validate` phase)
- If route has `schema`, run validator; on failure throw 400 `HttpError`
- Test: route with schema, send invalid body, expect 400

---

## Phase 7 — Error Handling

### 7.1 Implement default error handler
- File: `src/errors/error.handler.js`
- Catches thrown errors, sets status from `HttpError.statusCode` or 500
- Sends JSON `{ error: message }`
- Test: throw inside handler, verify 500 response

### 7.2 Wire `onError` hooks
- `app.onError(fn)` adds to error hook chain
- Errors in any lifecycle stage are routed through `onError`
- Test: register custom `onError`, throw in handler, verify custom response

### 7.3 Handle edge cases
- Double `send()` prevention (warn, ignore second call)
- Unparseable URL handling (respond 400)
- Test: double send does not crash; bad URL returns 400

---

## Phase 8 — Plugin System

### 8.1 Implement `app.decorate` and `app.decorateCtx`
- `decorate(name, value)` — attach to app instance
- `decorateCtx(name, value)` — attach to every new `Ctx`
- Throw if name already exists
- Test: decorate app, access property; decorate ctx, access in handler

### 8.2 Implement `app.register`
- File: `src/plugins/plugin.loader.js`
- `register(pluginFn, opts)` calls `pluginFn(app, opts)`
- Plugins execute synchronously at registration time
- Test: register plugin that adds a hook, verify hook runs

---

## Phase 9 — Response Serialization

### 9.1 Implement smart `send()`
- Auto-detect type: `string` -> text/plain, `object/array` -> JSON,
  `Buffer` -> application/octet-stream, `ReadableStream` -> pipe
- Set `Content-Type` and `Content-Length` automatically
- Test: send string, object, buffer — verify headers and body

### 9.2 Implement `ctx.stream(readable)`
- Pipe a `node:stream.Readable` to response
- Handle stream errors (destroy response on error)
- Test: stream a file, verify contents

### 9.3 Wire `preSerialization` and `onSend` hooks
- `preSerialization` receives payload before JSON.stringify
- `onSend` receives serialized string/buffer
- Test: hook modifies payload, verify final response

---

## Phase 10 — Static File Serving

### 10.1 Implement MIME type map
- File: `src/static/mime.map.js`
- Map of common extensions to MIME types (~30 entries)
- Test: lookup `.html`, `.js`, `.png`, unknown

### 10.2 Implement static file handler
- File: `src/static/static.handler.js`
- Resolve path safely (prevent directory traversal)
- Stream file, set `Content-Type`, `Content-Length`, `Last-Modified`, `ETag`
- Test: serve a temp file, verify response headers and body

### 10.3 Add `app.static(urlPrefix, dirPath)`
- Register a wildcard route that delegates to static handler
- Test: place a temp file, request it, verify content

---

## Phase 11 — Utilities & Polish

### 11.1 Implement header utilities
- File: `src/utils/header.utils.js`
- `parseContentType(header)`, `parseCookies(header)`
- Test: parse common content-type strings, cookie strings

### 11.2 Implement URL utilities
- File: `src/utils/url.utils.js`
- `parseQuery(searchParams)` — `URLSearchParams` to plain object
- Test: parse query strings with arrays, special chars

### 11.3 Finalize public API exports
- File: `src/index.js`
- Re-export: `createApp`, `HttpError`, `definePlugin`
- Verify named exports work correctly
- Test: import from package entry point

---

## Phase 12 — Integration & Hardening

### 12.1 End-to-end integration test
- Start app with routes, middleware, hooks, body parsing, validation
- Run a sequence of HTTP requests covering happy and error paths
- Verify full lifecycle

### 12.2 Performance smoke test
- Simple benchmark: 1000 sequential requests to a JSON route
- Log requests/sec (informational, no hard threshold)

### 12.3 Review & cleanup
- Remove placeholder files
- Verify all tests pass
- Verify lint passes
- Final JSDoc review

---

## Phase 13 — Production Readiness

### 13.1 Graceful shutdown
- Handle `SIGTERM` and `SIGINT` signals
- Stop accepting new connections, drain in-flight requests with a configurable
  timeout (default: 30 s), then force-close
- `app.listen({ signal: AbortSignal })` support for programmatic shutdown
- Test: start server, send request, trigger shutdown mid-flight, verify
  response completes; verify forced close after timeout

### 13.2 Request timeout
- Configurable per-request timeout (default: 30 s)
- On timeout: destroy socket, fire `onError` with a 408 `HttpError`
- Test: handler that never responds, verify 408 after timeout

### 13.3 Request ID and tracing
- File: `src/utils/request.id.js`
- Generate unique request ID per request (`crypto.randomUUID()`)
- Expose as `ctx.id`; set `X-Request-Id` response header
- If incoming `X-Request-Id` header exists, reuse it (proxy-friendly)
- Test: verify ID on response, verify passthrough of incoming ID

### 13.4 Proxy trust and forwarded headers
- `app.set('trustProxy', true | false | hops)` configuration
- When trusted: derive `ctx.ip`, `ctx.protocol`, `ctx.hostname` from
  `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`
- When untrusted: use `req.socket.remoteAddress` / connection info
- Test: with trust on/off, verify correct IP and protocol resolution

### 13.5 Security headers
- File: `src/plugins/security.headers.js`
- Built-in plugin that sets safe defaults (opt-in via `app.register`):
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Strict-Transport-Security`, `X-XSS-Protection: 0`,
  `Content-Security-Policy` (basic default)
- Each header is individually configurable or disableable
- Test: register plugin, verify headers on response

### 13.6 CORS plugin
- File: `src/plugins/cors.js`
- Built-in plugin for `Access-Control-Allow-Origin`, `Allow-Methods`,
  `Allow-Headers`, `Expose-Headers`, `Max-Age`, `Credentials`
- Handle preflight `OPTIONS` requests automatically
- Configurable: `origin` (string, array, function), `methods`, `headers`
- Test: simple request headers, preflight request/response cycle

### 13.7 Content compression
- File: `src/plugins/compression.js`
- Built-in plugin using `node:zlib` (gzip and deflate)
- Negotiate via `Accept-Encoding` header
- Skip for small responses (< 1 KiB) and already-compressed MIME types
- Test: request with `Accept-Encoding: gzip`, verify compressed response
  and `Content-Encoding` header

### 13.8 Cookie support
- File: `src/utils/cookie.utils.js`
- `ctx.cookies` — parsed request cookies (lazy, from `Cookie` header)
- `ctx.setCookie(name, value, opts)` — build `Set-Cookie` header with
  `HttpOnly`, `Secure`, `SameSite`, `Path`, `Domain`, `Max-Age`, `Expires`
- Test: parse cookies from header, set cookie with options, verify header

### 13.9 Structured logging interface
- File: `src/utils/logger.js`
- Lightweight logger with levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`
- Default: writes JSON lines to `stdout`/`stderr`
- `app.set('logger', customLogger)` to swap implementation
- `ctx.log` — child logger with request ID attached
- Test: verify log output contains level, timestamp, request ID;
  verify custom logger is called

### 13.10 Rate limiting (basic in-memory)
- File: `src/plugins/rate.limit.js`
- Built-in plugin: token-bucket per IP using a `Map` with periodic cleanup
- Configurable: `max` (requests), `window` (ms), `keyFn` (custom key extractor)
- Responds 429 with `Retry-After` header on limit breach
- Not intended as a full solution — suitable for single-process deployments
- Test: send requests exceeding limit, verify 429 and `Retry-After`

### 13.11 Keep-alive and connection tuning
- Expose server tuning in `app.listen(opts)`:
  `keepAliveTimeout`, `headersTimeout`, `maxHeadersCount`,
  `maxRequestsPerSocket` (Node >= 18.10)
- Set sensible defaults: `keepAliveTimeout: 72_000`, `headersTimeout: 60_000`
- Test: verify server properties after listen

### 13.12 Cluster support
- File: `src/cluster/cluster.launcher.js`
- Optional helper using `node:cluster`:
  `import { launch } from '@e-watson/axon/cluster'`
- `launch(workerFn, { workers: os.availableParallelism() })`
- Auto-restart crashed workers with exponential backoff
- Graceful shutdown propagates to workers
- Test: launch 2 workers, verify both respond, kill one, verify restart

### 13.13 Test coverage enforcement
- Add `"test:coverage": "node --test --experimental-test-coverage"` to scripts
- Set minimum coverage threshold (target: statements 90%, branches 85%)
- Verify all phases 1–13 meet the threshold
- Test: run coverage, verify it passes threshold

### 13.14 Performance benchmark suite
- File: `benchmarks/run.js`
- Benchmarks: plain text response, JSON serialization, route params lookup,
  middleware chain (10 deep), body parsing
- Output: requests/sec, p50/p95/p99 latency
- Compare against baseline (self-hosted, no external tools needed)
- Informational — no hard gates, but regressions should be visible
