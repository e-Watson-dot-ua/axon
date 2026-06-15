# Contributing to Axon

Thanks for your interest in contributing! Axon is a minimal, **zero-runtime-dependency**
HTTP framework. The most important rule follows from that: **no external runtime
dependencies, ever** — only `node:*` built-ins. Dev dependencies (lint, format, types)
are fine.

## Getting started

```bash
git clone https://github.com/e-Watson-dot-ua/axon.git
cd axon
npm install
npm test
```

Requires Node.js >= 18.

## Development workflow

| Command | Purpose |
| ------- | ------- |
| `npm test` | Run the full test suite (Node's built-in runner) |
| `npm run test:coverage` | Tests with coverage |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (write) |
| `npm run format:check` | Prettier (check) |
| `npm run typecheck` | Type-check JSDoc via `tsc --noEmit` |
| `npm run build:types` | Emit `.d.ts` declarations |
| `npm run bench` | Performance benchmark |

Before opening a PR, make sure `npm run lint`, `npm run format:check`,
`npm run typecheck`, and `npm test` all pass — CI runs the same checks on Node 18, 20,
and 22.

## Conventions

- **No TypeScript** — plain JS with JSDoc types (`jsconfig.json` has `checkJs: true`).
- **File naming** is dot-separated: `radix.trie.js`, `body.parser.js`, `http.error.js`.
- **Tests** live in `tests/`, mirror `src/`, and are named `*.test.js`.
- **Paths** use `node:path` helpers (cross-platform — this project is tested on Windows).
- **Prettier**: single quotes, trailing commas, 100-char width, 2-space indent.

## Pull requests

1. Open an issue first for non-trivial changes.
2. Keep PRs focused; add tests for new behavior and bug fixes.
3. Update `CHANGELOG.md` (under an `Unreleased` heading) and relevant docs.
4. Never add a runtime dependency.

See [`docs/idea.md`](docs/idea.md) for architecture and design patterns.
