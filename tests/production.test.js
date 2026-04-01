import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, Logger, securityHeaders, cors, rateLimit } from '../src/index.js';
import { HTTP } from '../src/utils/http.status.js';

// ── 13.1 Graceful Shutdown ──────────────────────────────────────────────

describe('Graceful shutdown', () => {
  it('should close without error when requests have finished', async () => {
    const app = createApp();
    app.get('/test', (ctx) => ctx.send({ done: true }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.status, HTTP.OK);
    assert.equal((await res.json()).done, true);

    // Close after request completes — should drain cleanly
    await app.close({ timeout: 3000 });
  });

  it('should support AbortSignal for shutdown', async () => {
    const app = createApp();
    app.get('/test', (ctx) => ctx.send('ok'));
    const ac = new AbortController();
    const { port } = await app.listen({ port: 0, signal: ac.signal });

    // Verify it works
    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.status, HTTP.OK);

    // Abort to trigger shutdown
    ac.abort();
    await new Promise((r) => setTimeout(r, 100));
  });

  it('should close immediately when no in-flight requests', async () => {
    const app = createApp();
    await app.listen({ port: 0 });
    const start = Date.now();
    await app.close();
    assert.ok(Date.now() - start < 1000);
  });
});

// ── 13.2 Request Timeout ────────────────────────────────────────────────

describe('Request timeout', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should return 408 when handler exceeds timeout', async () => {
    app = createApp();
    app.get('/slow', async (ctx) => {
      await new Promise((r) => setTimeout(r, 500));
      ctx.send('too late');
    });
    const { port } = await app.listen({ port: 0, requestTimeout: 100 });

    const res = await fetch(`http://127.0.0.1:${port}/slow`);
    assert.equal(res.status, HTTP.REQUEST_TIMEOUT);
  });

  it('should not timeout fast requests', async () => {
    app = createApp();
    app.get('/fast', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0, requestTimeout: 5000 });

    const res = await fetch(`http://127.0.0.1:${port}/fast`);
    assert.equal(res.status, HTTP.OK);
  });
});

// ── 13.3 Request ID ─────────────────────────────────────────────────────

describe('Request ID', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should generate X-Request-Id header', async () => {
    app = createApp();
    app.get('/test', (ctx) => ctx.send({ id: ctx.id }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId);
    assert.ok(requestId.length > 0);

    const body = await res.json();
    assert.equal(body.id, requestId);
  });

  it('should reuse incoming X-Request-Id', async () => {
    app = createApp();
    app.get('/test', (ctx) => ctx.send({ id: ctx.id }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: { 'X-Request-Id': 'my-custom-id-123' },
    });

    assert.equal(res.headers.get('x-request-id'), 'my-custom-id-123');
    assert.equal((await res.json()).id, 'my-custom-id-123');
  });
});

// ── 13.4 Proxy Trust ────────────────────────────────────────────────────

describe('Proxy trust', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should use socket IP when trustProxy is off', async () => {
    app = createApp();
    app.get('/ip', (ctx) => ctx.send({ ip: ctx.ip, proto: ctx.protocol }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/ip`, {
      headers: { 'X-Forwarded-For': '1.2.3.4', 'X-Forwarded-Proto': 'https' },
    });
    const body = await res.json();
    assert.ok(body.ip.includes('127.0.0.1'));
    assert.equal(body.proto, 'http');
  });

  it('should use forwarded headers when trustProxy is on', async () => {
    app = createApp();
    app.set('trustProxy', true);
    app.get('/ip', (ctx) => ctx.send({
      ip: ctx.ip,
      proto: ctx.protocol,
      host: ctx.hostname,
    }));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/ip`, {
      headers: {
        'X-Forwarded-For': '1.2.3.4, 10.0.0.1',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'example.com',
      },
    });
    const body = await res.json();
    assert.equal(body.ip, '1.2.3.4');
    assert.equal(body.proto, 'https');
    assert.equal(body.host, 'example.com');
  });
});

// ── 13.5 Security Headers ───────────────────────────────────────────────

describe('Security headers plugin', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should set default security headers', async () => {
    app = createApp();
    app.register(securityHeaders);
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-xss-protection'), '0');
    assert.ok(res.headers.get('strict-transport-security'));
    assert.ok(res.headers.get('content-security-policy'));
  });

  it('should allow disabling individual headers', async () => {
    app = createApp();
    app.register(securityHeaders, { frameOptions: false, hsts: false });
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), null);
    assert.equal(res.headers.get('strict-transport-security'), null);
  });
});

// ── 13.6 CORS ───────────────────────────────────────────────────────────

describe('CORS plugin', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should set Access-Control-Allow-Origin on simple requests', async () => {
    app = createApp();
    app.register(cors);
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: { 'Origin': 'http://example.com' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  it('should handle preflight OPTIONS requests', async () => {
    app = createApp();
    app.register(cors, { origin: 'http://example.com', maxAge: 3600 });
    app.post('/api', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/api`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    assert.equal(res.status, HTTP.NO_CONTENT);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://example.com');
    assert.ok(res.headers.get('access-control-allow-methods'));
    assert.equal(res.headers.get('access-control-max-age'), '3600');
  });

  it('should support credentials option', async () => {
    app = createApp();
    app.register(cors, { origin: 'http://example.com', credentials: true });
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: { 'Origin': 'http://example.com' },
    });
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });
});

// ── 13.8 Cookie Support ─────────────────────────────────────────────────

describe('Cookie support', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should parse request cookies', async () => {
    app = createApp();
    app.get('/test', (ctx) => {
      ctx.send({ session: ctx.cookies.session, theme: ctx.cookies.theme });
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`, {
      headers: { 'Cookie': 'session=abc123; theme=dark' },
    });
    const body = await res.json();
    assert.equal(body.session, 'abc123');
    assert.equal(body.theme, 'dark');
  });

  it('should set response cookies with options', async () => {
    app = createApp();
    app.get('/test', (ctx) => {
      ctx.setCookie('token', 'xyz', {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: 3600,
      });
      ctx.send('ok');
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    const cookie = res.headers.get('set-cookie');
    assert.ok(cookie);
    assert.ok(cookie.includes('token=xyz'));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('SameSite=Strict'));
    assert.ok(cookie.includes('Path=/'));
    assert.ok(cookie.includes('Max-Age=3600'));
  });

  it('should support multiple Set-Cookie headers', async () => {
    app = createApp();
    app.get('/test', (ctx) => {
      ctx.setCookie('a', '1');
      ctx.setCookie('b', '2');
      ctx.send('ok');
    });
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    const cookies = res.headers.getSetCookie();
    assert.ok(cookies.length >= 2);
    assert.ok(cookies.some((c) => c.includes('a=1')));
    assert.ok(cookies.some((c) => c.includes('b=2')));
  });
});

// ── 13.9 Structured Logging ─────────────────────────────────────────────

describe('Logger', () => {
  it('should create a logger with default level', () => {
    const logger = new Logger();
    assert.ok(logger);
  });

  it('should create child loggers with extra fields', () => {
    const parent = new Logger({ level: 'debug' });
    const child = parent.child({ reqId: 'abc' });
    assert.ok(child);
    // child should inherit parent level - just verify it doesn't throw
    child.debug('test message');
  });

  it('should attach ctx.log with request ID', async () => {
    const app = createApp();
    let logHasReqId = false;
    app.get('/test', (ctx) => {
      logHasReqId = ctx.log !== undefined;
      ctx.send('ok');
    });
    const { port } = await app.listen({ port: 0 });

    await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(logHasReqId, true);
    await app.close();
  });
});

// ── 13.10 Rate Limiting ─────────────────────────────────────────────────

describe('Rate limiting plugin', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('should allow requests within limit', async () => {
    app = createApp();
    app.register(rateLimit, { max: 5, window: 10_000 });
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    for (let i = 0; i < 5; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      assert.equal(res.status, HTTP.OK);
      assert.ok(res.headers.get('x-ratelimit-remaining'));
    }
  });

  it('should return 429 when limit exceeded', async () => {
    app = createApp();
    app.register(rateLimit, { max: 2, window: 10_000 });
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    await fetch(`http://127.0.0.1:${port}/test`);
    await fetch(`http://127.0.0.1:${port}/test`);
    const res = await fetch(`http://127.0.0.1:${port}/test`);

    assert.equal(res.status, HTTP.TOO_MANY_REQUESTS);
    assert.ok(res.headers.get('retry-after'));
  });

  it('should set rate limit headers', async () => {
    app = createApp();
    app.register(rateLimit, { max: 10, window: 60_000 });
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.headers.get('x-ratelimit-limit'), '10');
    assert.ok(res.headers.get('x-ratelimit-remaining'));
    assert.ok(res.headers.get('x-ratelimit-reset'));
  });
});

// ── 13.11 Keep-alive Tuning ─────────────────────────────────────────────

describe('Keep-alive tuning', () => {
  it('should accept custom timeout values', async () => {
    const app = createApp();
    app.get('/test', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({
      port: 0,
      keepAliveTimeout: 5000,
      headersTimeout: 3000,
    });
    // Just verify it starts and responds without error
    const res = await fetch(`http://127.0.0.1:${port}/test`);
    assert.equal(res.status, HTTP.OK);
    await app.close();
  });
});
