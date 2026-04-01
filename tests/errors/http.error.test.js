import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../src/errors/http.error.js';

describe('HttpError', () => {
  it('should set statusCode, message, and details', () => {
    const err = new HttpError(404, 'User not found', { id: 42 });
    assert.equal(err.statusCode, 404);
    assert.equal(err.message, 'User not found');
    assert.deepEqual(err.details, { id: 42 });
    assert.equal(err.name, 'HttpError');
  });

  it('should be an instance of Error', () => {
    const err = new HttpError(500);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof HttpError);
  });

  it('should use default message when none provided', () => {
    const err = new HttpError(400);
    assert.equal(err.message, 'Bad Request');
  });

  it('should fall back to "Unknown Error" for unmapped codes', () => {
    const err = new HttpError(418);
    assert.equal(err.message, 'Unknown Error');
  });

  it('should have a stack trace', () => {
    const err = new HttpError(500, 'boom');
    assert.ok(err.stack.includes('boom'));
  });
});
