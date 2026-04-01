# Axon

Minimal, zero-dependency HTTP framework for Node.js built entirely on native APIs.

## Project overview

- **Package**: `@e-watson/axon`
- **Runtime**: Node.js >= 18, ESM-only
- **Zero runtime dependencies** — only `node:*` built-in modules
- **No TypeScript** — plain JS with JSDoc types (`jsconfig.json` has `checkJs: true`)

## Architecture

- `src/app.js` — Axon class: routing, middleware, lifecycle hooks, server
- `src/context.js` — Ctx: per-request context wrapping req/res
- `src/router/radix.trie.js` — radix trie for fast path matching (static, `:param`, `*wildcard`)
- `src/router/router.js` — Router facade (one trie per HTTP method)
- `src/middleware/compose.js` — onion-model middleware composition
- `src/lifecycle/hooks.js` — hook registry (8 lifecycle stages)
- `src/lifecycle/pipeline.js` — sequential hook runner
- `src/parsers/body.parser.js` — body parsing dispatcher (JSON, text, URL-encoded, raw)
- `src/validation/schema.validator.js` — built-in schema validator
- `src/validation/validator.js` — swappable validator strategy
- `src/plugins/` — built-in plugins: cors, compression, security headers, rate limiting
- `src/static/` — static file serving with ETag, MIME detection
- `src/utils/logger.js` — structured logger (colored TTY / JSON pipe)
- `src/cluster/cluster.launcher.js` — node:cluster launcher with auto-restart

## Request lifecycle

```
onRequest → preParsing → parse → preValidation → validate → preHandler → handler → preSerialization → onSend → onResponse
```

Errors at any stage route through `onError` hooks.

## Commands

- `npm test` — run all tests (Node.js built-in test runner)
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run bench` — performance benchmark
- `npm run test:coverage` — test coverage report

## Conventions

- File naming: dot-separated (e.g., `radix.trie.js`, `body.parser.js`, `http.error.js`)
- Tests live in `tests/` directory, mirroring `src/` structure
- Test files: `*.test.js`
- All file paths use `node:path.join()` / `node:path.resolve()` (cross-platform)
- No external runtime dependencies — ever
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent
- ESLint: `no-unused-vars` (with `_` prefix ignore), `no-console` warning

## Design docs

- `docs/idea.md` — full architecture and design patterns
- `docs/dev.plan.md` — development plan (Phases 0–13)
