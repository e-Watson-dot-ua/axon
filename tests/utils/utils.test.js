import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseContentType, parseCookies } from '../../src/utils/header.utils.js';
import { parseQuery } from '../../src/utils/url.utils.js';

describe('parseContentType', () => {
  it('should parse type and charset', () => {
    const result = parseContentType('application/json; charset=utf-8');
    assert.equal(result.type, 'application/json');
    assert.equal(result.params.charset, 'utf-8');
  });

  it('should handle type without params', () => {
    const result = parseContentType('text/plain');
    assert.equal(result.type, 'text/plain');
    assert.equal(Object.keys(result.params).length, 0);
  });

  it('should handle multiple params', () => {
    const result = parseContentType('multipart/form-data; boundary=abc; charset=utf-8');
    assert.equal(result.params.boundary, 'abc');
    assert.equal(result.params.charset, 'utf-8');
  });
});

describe('parseCookies', () => {
  it('should parse cookie pairs', () => {
    const cookies = parseCookies('session=abc123; theme=dark');
    assert.equal(cookies.session, 'abc123');
    assert.equal(cookies.theme, 'dark');
  });

  it('should handle URL-encoded values', () => {
    const cookies = parseCookies('name=hello%20world');
    assert.equal(cookies.name, 'hello world');
  });

  it('should return empty object for empty string', () => {
    const cookies = parseCookies('');
    assert.equal(Object.keys(cookies).length, 0);
  });
});

describe('parseQuery', () => {
  it('should convert URLSearchParams to object', () => {
    const params = new URLSearchParams('q=axon&limit=10');
    const obj = parseQuery(params);
    assert.equal(obj.q, 'axon');
    assert.equal(obj.limit, '10');
  });

  it('should use last value for duplicate keys', () => {
    const params = new URLSearchParams('a=1&a=2');
    const obj = parseQuery(params);
    assert.equal(obj.a, '2');
  });

  it('should handle special characters', () => {
    const params = new URLSearchParams('q=hello+world&tag=%26');
    const obj = parseQuery(params);
    assert.equal(obj.q, 'hello world');
    assert.equal(obj.tag, '&');
  });
});
