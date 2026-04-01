import { describe, it, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getMimeType } from '../../src/static/mime.map.js';
import { createApp } from '../../src/app.js';

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
    assert.equal(res.status, 200);
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
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
  });

  it('should serve directory index.html', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/sub`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<h1>Index</h1>'));
  });

  it('should return 404 for missing files', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/nope.txt`);
    assert.equal(res.status, 404);
  });

  it('should prevent directory traversal', async () => {
    app = createApp();
    app.static('/public', tmpDir);
    const { port } = await app.listen({ port: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/public/..%2F..%2Fetc%2Fpasswd`);
    assert.ok([403, 404].includes(res.status));
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
    assert.equal(second.status, 304);
  });
});
