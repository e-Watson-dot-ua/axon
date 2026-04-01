/**
 * Built-in lightweight schema validator.
 * Supports: type, required, properties, minLength, maxLength, min, max, pattern, enum, format.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a value against a schema definition.
 *
 * @param {any} value
 * @param {import('../types.js').SchemaDefinition} schema
 * @param {string} [path] dot-path for error messages
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(value, schema, path = '') {
  /** @type {string[]} */
  const errors = [];

  if (schema.type) {
    if (!checkType(value, schema.type)) {
      errors.push(`${path || 'value'} must be of type ${schema.type}`);
      return { valid: false, errors };
    }
  }

  if (schema.type === 'object' && schema.properties && typeof value === 'object' && value !== null) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path ? path + '.' : ''}${key} is required`);
        }
      }
    }

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in value) {
        const nested = validateSchema(value[key], propSchema, path ? `${path}.${key}` : key);
        errors.push(...nested.errors);
      }
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path || 'value'} must have at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path || 'value'} must have at most ${schema.maxLength} characters`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path || 'value'} must match pattern ${schema.pattern}`);
    }
    if (schema.format === 'email' && !EMAIL_RE.test(value)) {
      errors.push(`${path || 'value'} must be a valid email`);
    }
  }

  if (typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${path || 'value'} must be >= ${schema.min}`);
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${path || 'value'} must be <= ${schema.max}`);
    }
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path || 'value'} must be one of: ${schema.enum.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {any} value
 * @param {string} type
 * @returns {boolean}
 */
function checkType(value, type) {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean': return typeof value === 'boolean';
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    default: return true;
  }
}
