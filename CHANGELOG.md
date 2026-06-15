# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-06-15

First hardening release. Resolves the findings from the code review in
[`docs/review.md`](docs/review.md) and adds operational features.

### Added

- **HTTP method semantics**: automatic `HEAD` (routed to the `GET` handler with the
  body stripped), automatic `OPTIONS` responses, and `405 Method Not Allowed` with an
  `Allow` header when a path exists for other methods.
- **Static byte-range requests**: `Accept-Ranges`, `206 Partial Content`, suffix ranges,
  and `416 Range Not Satisfiable`. Conditional `If-None-Match` now handles lists, weak
  validators, and `*`.
- **Structured logging**: `Logger` gains a `json` mode (auto-enabled when stdout is not
  a TTY) for newline-delimited JSON.
- **`accessLog()` middleware**: one structured log line per request.
- **`installProcessGuards()`**: opt-in `unhandledRejection` / `uncaughtException`
  handlers with optional graceful drain on `SIGTERM`/`SIGINT`.
- **Pluggable rate-limit store** via `rateLimit(app, { store })` (async `get`/`set`),
  for shared limits across instances.
- **Graceful worker shutdown** in `launch()`: return the app (or a cleanup function)
  from the worker to have it drained on signal.
- **`bodyLimit`** app setting is now wired to the body parser.
- **Type declarations**: `.d.ts` files are emitted on publish and exposed via the
  package `types` field.
- **CI**: GitHub Actions matrix (Node 18/20/22) running tests, lint, format, typecheck,
  declaration build, and coverage.

### Fixed

- **Request-timeout double-send**: the timeout no longer sends through a throwaway
  context that could race a late handler response.
- **Error hooks that neither respond nor throw** no longer leave the request hanging.
- **Cluster restart backoff** now actually escalates and no longer leaks a map entry
  per crashed worker.
- **Prototype pollution**: `__proto__` is dropped from parsed JSON, query, and
  URL-encoded bodies.
- **Schema validator** uses own-property checks instead of `in` (no prototype-chain
  false positives).
- **Log injection**: CR/LF stripped from log messages (text mode).
- **Robustness**: cookie / content-type parsing and the static handler no longer throw
  on malformed percent-encoding or null bytes.
- **`X-Request-Id`** is validated before reuse (charset + length cap).
- Early rejection on oversized `Content-Length`.

### Security

- CORS now throws at registration when `origin: '*'` is combined with
  `credentials: true`.
- Compression sets `Vary: Accept-Encoding` on every negotiated response, skips
  already-encoded bodies, and compresses asynchronously (no event-loop blocking).
- CORS sets `Vary: Origin` when reflecting an origin.

[0.1.0]: https://github.com/e-Watson-dot-ua/axon/releases/tag/v0.1.0
