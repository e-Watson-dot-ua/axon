/**
 * Shared type definitions for Axon.
 *
 * This file contains JSDoc typedefs used across the codebase.
 * It is not imported at runtime — only referenced via @typedef comments.
 */

/**
 * @typedef {import('node:http').IncomingMessage} IncomingMessage
 * @typedef {import('node:http').ServerResponse} ServerResponse
 * @typedef {import('node:http').Server} HttpServer
 * @typedef {import('node:stream').Readable} Readable
 */

/**
 * @typedef {Object} RouteMatch
 * @property {Function} handler
 * @property {Object<string, string>} params
 * @property {MiddlewareFn[]} middleware
 * @property {RouteSchema} [schema]
 */

/**
 * @callback MiddlewareFn
 * @param {Ctx} ctx
 * @param {() => Promise<void>} next
 * @returns {Promise<void> | void}
 */

/**
 * @callback HandlerFn
 * @param {Ctx} ctx
 * @returns {Promise<void> | void}
 */

/**
 * @callback ErrorHandlerFn
 * @param {Error} err
 * @param {Ctx} ctx
 * @returns {Promise<void> | void}
 */

/**
 * @callback HookFn
 * @param {Ctx} ctx
 * @returns {Promise<void> | void}
 */

/**
 * @typedef {Object} RouteSchema
 * @property {SchemaDefinition} [body]
 * @property {SchemaDefinition} [query]
 * @property {SchemaDefinition} [params]
 */

/**
 * @typedef {Object} SchemaDefinition
 * @property {'string' | 'number' | 'boolean' | 'object' | 'array'} type
 * @property {string[]} [required]
 * @property {Object<string, SchemaDefinition>} [properties]
 * @property {number} [minLength]
 * @property {number} [maxLength]
 * @property {number} [min]
 * @property {number} [max]
 * @property {string} [pattern]
 * @property {(string | number | boolean)[]} [enum]
 * @property {'email'} [format]
 */

/**
 * @typedef {Object} ListenOptions
 * @property {number} [port=0]
 * @property {string} [host='0.0.0.0']
 * @property {AbortSignal} [signal]
 * @property {number} [keepAliveTimeout=72000]
 * @property {number} [headersTimeout=60000]
 */

/**
 * @typedef {Object} ListenResult
 * @property {string} address
 * @property {number} port
 */

/**
 * Placeholder — replaced by actual Ctx class once implemented.
 * @typedef {Object} Ctx
 */

export {};
