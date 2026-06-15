# Code Review — 2026-06-15

Review of the Axon framework for correctness and security issues, with fixes applied.
Baseline before review: 177 tests passing. After fixes: **186 passing** (9 regression
tests added in `tests/security.test.js`).

## Summary

| # | Severity | Area | Issue | Status |
|---|----------|------|-------|--------|
| 1 | High | `app.js` request timeout | Throwaway `Ctx` double-send | ✅ Fixed |
| 2 | High | `app.js` error handling | Error hooks that don't respond hang the request | ✅ Fixed |
| 3 | High | `cluster.launcher.js` | Backoff never escalates + unbounded map leak | ✅ Fixed |
| 4 | High | `logger.js` | Log injection via unsanitized message | ✅ Fixed |
| 5 | High | `json.parser.js` | Prototype pollution via `__proto__` | ✅ Fixed |
| 6 | High | `schema.validator.js` | `key in value` traverses prototype chain | ✅ Fixed |
| 7 | Medium | `cors.js` | Missing `Vary: Origin` (cache poisoning) | ✅ Fixed |
| 8 | Medium | `compression.js` | `Vary` only on compressed branch; double-compress; sync blocks event loop | ✅ Fixed |
| 9 | Medium | `header.utils.js` | `parseCookies` crashes on malformed `%`-encoding | ✅ Fixed |
| 10 | Medium | `header.utils.js` | `parseContentType` crashes on non-string header | ✅ Fixed |
| 11 | Medium | `request.id.js` | Untrusted `X-Request-Id` reused unvalidated | ✅ Fixed |
| 12 | Medium | `static.handler.js` | `decodeURIComponent` throws → 500; null-byte path | ✅ Fixed |
| 13 | Low | `url.utils.js` / `urlencoded.parser.js` / `context.js` | `__proto__` key kept as pollution gadget | ✅ Fixed |
| 14 | Low | `stream.utils.js` | No early reject on oversized `Content-Length` | ✅ Fixed |
| 15 | Low | `app.js` | `bodyLimit` setting was not wired to the parser | ✅ Fixed |

## Details

### 1. Request-timeout double-send (`src/app.js`)
The timeout callback created a **new** `Ctx(req, res)`, so its `sent` flag was
independent of the real request context. A handler responding just after the timer
fired would double-send (`ERR_HTTP_HEADERS_SENT`). **Fix:** reuse the real `ctx`; its
`sent` guard now serializes the two paths.

### 2. Error-hook hang (`src/app.js`)
`#handleError` returned immediately after running `onError` hooks. If a hook neither
sent a response nor threw, the client connection hung until timeout. **Fix:** always
fall through to the default response when `!ctx.sent`; a throwing hook surfaces its own
error to the default handler.

### 3. Cluster restart backoff (`src/cluster/cluster.launcher.js`)
`restartCounts` was keyed by `worker.id`, but `cluster.fork()` always allocates a new
id — so the exponential backoff was pinned at ~1s forever and the map grew by one entry
per crash. **Fix:** a single consecutive-crash counter that resets after the fleet has
been stable for `maxRestartDelay`.

### 4. Log injection (`src/utils/logger.js`)
The `msg` argument was interpolated raw into the log line; a CRLF in caller-supplied
text (path, header, error message) could forge extra log lines. **Fix:** strip CR/LF
from `msg` before writing.

### 5 & 13. Prototype pollution
`parseJson` now drops `__proto__` keys via a reviver. Query/urlencoded/`ctx.query`
objects skip `__proto__`/`constructor`/`prototype` keys so a downstream spread/merge
cannot become a pollution gadget.

### 6. Validator prototype-chain checks (`src/validation/schema.validator.js`)
`key in value` returned true for inherited properties (`toString`, `constructor`),
letting `required` pass spuriously. **Fix:** `Object.prototype.hasOwnProperty.call`.

### 7 & 8. Cache-correctness for content negotiation
CORS now emits `Vary: Origin` whenever the origin is reflected. Compression sets
`Vary: Accept-Encoding` on **every** branch (compressed or not), skips already-encoded
responses (no double-compress corruption), and compresses **asynchronously** so a large
body no longer blocks the event loop. A new `appendVary()` helper appends without
clobbering an existing `Vary`.

### 9–12. Input robustness
- `parseCookies` falls back to the raw value on a `URIError`.
- `parseContentType` returns an empty result for a missing/non-string header.
- `getRequestId` only reuses an inbound id matching `^[A-Za-z0-9._-]{1,128}$`.
- Static handler returns `400` for malformed encoding or an embedded null byte instead
  of a `500`.

### 14 & 15. Body limits
`collectBody` rejects early when the declared `Content-Length` exceeds the limit. The
`bodyLimit` app setting is now passed through to the parser (previously unreachable).

## Not changed (noted, lower priority / by-design)
- **Static `Content-Length`/stream TOCTOU** on file change between `stat` and stream open
  (low impact; would require `fstat` on an open handle).

---

# Production-Readiness Pass — 2026-06-15

Follow-up to the review above. Implemented the protocol/operational gaps surfaced when
assessing production-readiness. Released as **0.1.0**. Test suite: **200 passing**.

| # | Priority | Area | Improvement | Status |
|---|----------|------|-------------|--------|
| 1 | P0 | Router/app | Auto `HEAD`→GET (body stripped), `405`+`Allow`, auto `OPTIONS` | ✅ Done |
| 2 | P0 | Infra | GitHub Actions CI (Node 18/20/22: test, lint, format, typecheck, coverage) | ✅ Done |
| 3 | P0 | Packaging | Emit `.d.ts` (`tsconfig.build.json`, `types` field, `build:types`) | ✅ Done |
| 4 | P1 | CORS | Throw on `origin:'*'` + `credentials:true` | ✅ Done |
| 5 | P1 | Rate limit | Pluggable async store; documented per-process default | ✅ Done |
| 6 | P1 | Cluster | Graceful worker drain on SIGTERM (return app/cleanup from `workerFn`) | ✅ Done |
| 7 | P1 | Process | `installProcessGuards()` for unhandledRejection/uncaughtException | ✅ Done |
| 8 | P1 | Docs | README accuracy (8 hooks), CHANGELOG, SECURITY, CONTRIBUTING | ✅ Done |
| 9 | P2 | Static | `Range`/`206`/`416` + robust `If-None-Match` (lists, weak, `*`) | ✅ Done |
| 10 | P2 | Observability | JSON logger mode + `accessLog()` middleware | ✅ Done |
| 11 | P2 | Perf | Memoize `ctx.query`; cache compiled schema `pattern` regexes | ✅ Done |
| 12 | P2 | Hygiene | Fixed dev-dep advisory (`brace-expansion`) in lockfile | ✅ Done |

### New public API
- `accessLog(opts)` — per-request structured access log middleware.
- `installProcessGuards(opts)` — opt-in process-level safety nets + graceful shutdown.
- `Logger({ json })` — newline-delimited JSON output (auto when stdout is not a TTY).
- `rateLimit(app, { store })` — distributed/custom rate-limit backend.

### Still open (future work, not blocking)
- Static TOCTOU on `Content-Length` vs stream (open-handle `fstat`).
- Optional `If-Range` support for range requests.
- Coverage threshold enforcement in CI (coverage is reported, not gated).
