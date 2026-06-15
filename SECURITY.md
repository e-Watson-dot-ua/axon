# Security Policy

## Supported versions

Axon is pre-1.0. Security fixes are applied to the latest `0.x` release. Pin a
version and watch the [CHANGELOG](CHANGELOG.md).

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please report security issues privately — **do not** open a public issue.

- Use GitHub's [private vulnerability reporting](https://github.com/e-Watson-dot-ua/axon/security/advisories/new), or
- Email the maintainer (see `author` in `package.json`).

Include a description, affected version, and a minimal reproduction. You can expect
an acknowledgement within a few days and a coordinated disclosure once a fix is ready.

## Security posture

- **Zero runtime dependencies** — the published package uses only `node:*` built-ins,
  minimizing supply-chain surface.
- Request bodies are size-limited (`bodyLimit`) and parsed objects are protected
  against `__proto__` prototype pollution.
- Built-in `securityHeaders`, `cors`, and `rateLimit` plugins ship safe defaults.
- A reused `X-Request-Id` is validated against a safe charset and length.

### Operator responsibilities

- Terminate TLS at a trusted proxy/load balancer and enable `app.set('trustProxy', true)`
  only when behind one you control (it trusts `X-Forwarded-*`).
- Set an explicit CORS `origin` (never `'*'` with credentials — this is rejected).
- Configure a `Content-Security-Policy` appropriate to your app.
- For shared rate limits across instances, provide a distributed `store`.
