import { describe, it, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getMimeType } from '../../src/static/mime.map.js';
import { createApp } from '../../src/app.js';
import { HTTP } from '../../src/utils/http.status.js';

describe('getMimeType', () => {
  it('should return correct MIME for .html', () => {
    assert.equal(getMimeType('index.html'), 'text/html; charset=utf-8');
  });

  it('should return correct MIME for .js', () => {
    assert.equal(getMimeType('app.js'), 'text/javascript; charset=utf-8');
  });

  it('should return correct MIME for .png', () => {
    assert.equal(getMimeType('logo.png'), 'image/png');
  });

  it('should return octet-stream for unknown extension', () => {
    assert.equal(getMimeType('file.xyz'), 'application/octet-stream');
  });

  it('should be case-insensitive', () => {
    assert.equal(getMimeType('file.HTML'), 'text/html; charset=utf-8');
  });
});

describe('app.static()', () => {
  /** @type {import('../app.js').Axon | null} */
  let app = null;
  /** @type {string} */
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axon-static-'));
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'Hello Static');
    await fs.writeFile(path.join(tmpDir, 'data.json'), '{"ok":true}');
    await fs.mkdir(path.join(tmpDir, 'sub'));
    await fs.writeFile(path.join(tmpDir, 'sub', 'index.html'), '<h1>Index</h1>');
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('should serve a text file with correct headers', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/hello.txt`);
    assert.equal(res.status, HTTP.OK);
    assert.ok(res.headers.get('content-type').includes('text/plain'));
    assert.ok(res.headers.get('etag'));
    assert.ok(res.headers.get('last-modified'));
    assert.equal(await res.text(), 'Hello Static');
  });

  it('should serve a JSON file', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/data.json`);
    assert.equal(res.status, HTTP.OK);
    assert.ok(res.headers.get('content-type').includes('application/json'));
  });

  it('should serve directory index.html', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/sub`);
    assert.equal(res.status, HTTP.OK);
    const text = await res.text();
    assert.ok(text.includes('<h1>Index</h1>'));
  });

  it('should return 404 for missing files', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/nope.txt`);
    assert.equal(res.status, HTTP.NOT_FOUND);
  });

  it('should prevent directory traversal', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/..%2F..%2Fetc%2Fpasswd`);
    assert.ok([HTTP.FORBIDDEN, HTTP.NOT_FOUND].includes(res.status));
  });

  it('should return 304 on If-None-Match', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const first = await fetch(`http://127.0.0.1:${port}/public/hello.txt`);
    const etag = first.headers.get('etag');

    const second = await fetch(`http://127.0.0.1:${port}/public/hello.txt`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(second.status, HTTP.NOT_MODIFIED);
  });

  it('should honor If-None-Match with a weak validator and a list', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const first = await fetch(`http://127.0.0.1:${port}/public/hello.txt`);
    const etag = first.headers.get('etag');

    const res = await fetch(`http://127.0.0.1:${port}/public/hello.txt`, {
      headers: { 'If-None-Match': `"other", W/${etag}` },
    });
    assert.equal(res.status, HTTP.NOT_MODIFIED);
  });

  it('should advertise Accept-Ranges and serve a byte range as 206', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const full = await fetch(`http://127.0.0.1:${port}/public/hello.txt`);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');

    const res = await fetch(`http://127.0.0.1:${port}/public/hello.txt`, {
      headers: { Range: 'bytes=0-4' },
    });
    assert.equal(res.status, HTTP.PARTIAL_CONTENT);
    assert.equal(res.headers.get('content-range'), 'bytes 0-4/12');
    assert.equal(res.headers.get('content-length'), '5');
    assert.equal(await res.text(), 'Hello');
  });

  it('should serve a suffix range', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/hello.txt`, {
      headers: { Range: 'bytes=-6' },
    });
    assert.equal(res.status, HTTP.PARTIAL_CONTENT);
    assert.equal(await res.text(), 'Static');
  });

  it('should return 416 for an unsatisfiable range', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/hello.txt`, {
      headers: { Range: 'bytes=999-1000' },
    });
    assert.equal(res.status, HTTP.RANGE_NOT_SATISFIABLE);
    assert.equal(res.headers.get('content-range'), 'bytes */12');
  });
});
