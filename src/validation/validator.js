import { validateSchema } from './schema.validator.js';
import { HttpError } from '../errors/http.error.js';
import { HTTP } from '../utils/http.status.js';

/**
 * Validator strategy - wraps a validation function.
 * Default: built-in schema validator.
 */
export class Validator {
  /** @type {(value: any, schema: any) => { valid: boolean, errors: string[] }} */
  #validateFn = validateSchema;

  /**
   * Replace the validation function.
   * @param {(value: any, schema: any) => { valid: boolean, errors: string[] }} fn
   */
  setValidator(fn) {
    this.#validateFn = fn;
  }

  /**
   * Validate ctx parts against a route schema.
   * Throws HttpError 400 on failure.
   *
   * @param {{ body?: any, query?: any, params?: any }} data
   * @param {{ body?: any, query?: any, params?: any }} schema
   */
  validate(data, schema) {
    /** @type {string[]} */
    const allErrors = [];

    if (schema.body && data.body !== undefined) {
      allErrors.push(...this.#validateFn(data.body, schema.body).errors);
    }
    if (schema.query && data.query !== undefined) {
      allErrors.push(...this.#validateFn(data.query, schema.query).errors);
    }
    if (schema.params && data.params !== undefined) {
      allErrors.push(...this.#validateFn(data.params, schema.params).errors);
    }

    if (allErrors.length > 0) {
      throw new HttpError(HTTP.BAD_REQUEST, 'Validation failed', { errors: allErrors });
    }
  }
}
