import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from '../src/utils/logger.js';
import { accessLog } from '../src/middleware/access.log.js';
import { createApp } from '../src/index.js';

/** Capture process.stdout.write output during `fn`. */
function captureStdout(fn) {
  const orig = process.stdout.write;
  let out = '';
  // @ts-expect-error - test shim
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return out;
}

describe('Logger JSON mode', () => {
  it('emits one valid JSON object per line with level, msg and fields', () => {
    const log = new Logger({ level: 'info', json: true, base: { svc: 'api' } });
    const out = captureStdout(() => log.info('hello', { reqId: 'abc' }));
    const parsed = JSON.parse(out.trim());
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.msg, 'hello');
    assert.equal(parsed.svc, 'api');
    assert.equal(parsed.reqId, 'abc');
  });

  it('escapes newlines in the message (no log forging)', () => {
    const log = new Logger({ level: 'info', json: true });
    const out = captureStdout(() => log.info('a\nb'));
    // Exactly one line written; the newline is JSON-escaped inside the string.
    assert.equal(out.split('\n').filter(Boolean).length, 1);
    assert.equal(JSON.parse(out.trim()).msg, 'a\nb');
  });
});

describe('accessLog middleware', () => {
  /** @type {import('../src/app.js').Axon | null} */
  let app = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('logs a structured line per request with method, path and status', async () => {
    /** @type {any[]} */
    const lines = [];
    const logger = {
      info: (msg, extra) => lines.push({ level: 'info', msg, ...extra }),
      warn: (msg, extra) => lines.push({ level: 'warn', msg, ...extra }),
      error: (msg, extra) => lines.push({ level: 'error', msg, ...extra }),
    };
    app = createApp();
    app.use(accessLog({ logger }));
    app.get('/ok', (ctx) => ctx.send('ok'));
    const { port } = await app.listen({ port: 0 });

    await fetch(`http://127.0.0.1:${port}/ok`);
    const entry = lines.find((l) => l.msg === 'request');
    assert.ok(entry, 'expected a request log line');
    assert.equal(entry.method, 'GET');
    assert.equal(entry.path, '/ok');
    assert.equal(entry.status, 200);
    assert.equal(typeof entry.ms, 'number');
  });
});
