import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema } from '../../src/validation/schema.validator.js';
import { Validator } from '../../src/validation/validator.js';
import { HTTP } from '../../src/utils/http.status.js';

describe('validateSchema', () => {
  it('should pass valid object', () => {
    const result = validateSchema(
      { name: 'axon', email: 'a@b.com' },
      {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
        },
      },
    );
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should fail on missing required field', () => {
    const result = validateSchema(
      { name: 'axon' },
      { type: 'object', required: ['name', 'email'], properties: {} },
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('email is required')));
  });

  it('should fail on wrong type', () => {
    const result = validateSchema('not a number', { type: 'number' });
    assert.equal(result.valid, false);
  });

  it('should validate minLength', () => {
    const result = validateSchema('', { type: 'string', minLength: 1 });
    assert.equal(result.valid, false);
  });

  it('should validate maxLength', () => {
    const result = validateSchema('toolong', { type: 'string', maxLength: 3 });
    assert.equal(result.valid, false);
  });

  it('should validate min/max for numbers', () => {
    assert.equal(validateSchema(5, { type: 'number', min: 10 }).valid, false);
    assert.equal(validateSchema(20, { type: 'number', max: 10 }).valid, false);
    assert.equal(validateSchema(10, { type: 'number', min: 1, max: 100 }).valid, true);
  });

  it('should validate pattern', () => {
    assert.equal(validateSchema('abc', { type: 'string', pattern: '^[0-9]+$' }).valid, false);
    assert.equal(validateSchema('123', { type: 'string', pattern: '^[0-9]+$' }).valid, true);
  });

  it('should validate enum', () => {
    assert.equal(validateSchema('red', { type: 'string', enum: ['red', 'blue'] }).valid, true);
    assert.equal(validateSchema('green', { type: 'string', enum: ['red', 'blue'] }).valid, false);
  });

  it('should validate email format', () => {
    assert.equal(validateSchema('a@b.com', { type: 'string', format: 'email' }).valid, true);
    assert.equal(validateSchema('not-email', { type: 'string', format: 'email' }).valid, false);
  });

  it('should validate nested properties', () => {
    const result = validateSchema(
      { user: { age: 'not a number' } },
      {
        type: 'object',
        properties: { user: { type: 'object', properties: { age: { type: 'number' } } } },
      },
    );
    assert.equal(result.valid, false);
  });

  it('should validate arrays', () => {
    assert.equal(validateSchema([1, 2], { type: 'array' }).valid, true);
    assert.equal(validateSchema('not array', { type: 'array' }).valid, false);
  });

  it('should validate booleans', () => {
    assert.equal(validateSchema(true, { type: 'boolean' }).valid, true);
    assert.equal(validateSchema('yes', { type: 'boolean' }).valid, false);
  });

  it('should reject NaN as number', () => {
    assert.equal(validateSchema(NaN, { type: 'number' }).valid, false);
  });
});

describe('Validator (strategy)', () => {
  it('should use built-in validator by default', () => {
    const v = new Validator();
    assert.throws(
      () => v.validate({ body: { x: 1 } }, { body: { type: 'string' } }),
      (err) => /** @type {any} */ (err).statusCode === HTTP.BAD_REQUEST,
    );
  });

  it('should accept a custom validator', () => {
    const v = new Validator();
    let called = false;
    v.setValidator(() => {
      called = true;
      return { valid: true, errors: [] };
    });
    v.validate({ body: 'anything' }, { body: { type: 'string' } });
    assert.equal(called, true);
  });

  it('should validate body, query, and params independently', () => {
    const v = new Validator();
    // body valid, query invalid
    assert.throws(
      () =>
        v.validate(
          { body: { name: 'ok' }, query: { page: 'abc' } },
          {
            body: { type: 'object', properties: { name: { type: 'string' } } },
            query: { type: 'number' },
          },
        ),
      (err) => /** @type {any} */ (err).statusCode === HTTP.BAD_REQUEST,
    );
  });

  it('should skip parts not in schema', () => {
    const v = new Validator();
    // No error — query has no schema
    v.validate(
      { body: 'hello', query: { anything: true } },
      { body: { type: 'string' } },
    );
  });
});
