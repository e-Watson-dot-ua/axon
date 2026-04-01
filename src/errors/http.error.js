import { HTTP } from '../utils/http.status.js';

/**
 * HTTP-aware error with a status code.
 */
export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} [message]
   * @param {Object} [details]
   */
  constructor(statusCode, message, details) {
    super(message ?? HttpError.defaultMessage(statusCode));
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'HttpError';
  }

  /**
   * @param {number} code
   * @returns {string}
   */
  static defaultMessage(code) {
    return STATUS_MESSAGES[code] ?? 'Unknown Error';
  }
}

/** @type {Record<number, string>} */
const STATUS_MESSAGES = {
  [HTTP.BAD_REQUEST]: 'Bad Request',
  [HTTP.UNAUTHORIZED]: 'Unauthorized',
  [HTTP.FORBIDDEN]: 'Forbidden',
  [HTTP.NOT_FOUND]: 'Not Found',
  [HTTP.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HTTP.REQUEST_TIMEOUT]: 'Request Timeout',
  [HTTP.CONFLICT]: 'Conflict',
  [HTTP.GONE]: 'Gone',
  [HTTP.PAYLOAD_TOO_LARGE]: 'Payload Too Large',
  [HTTP.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
  [HTTP.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HTTP.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HTTP.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HTTP.NOT_IMPLEMENTED]: 'Not Implemented',
  [HTTP.BAD_GATEWAY]: 'Bad Gateway',
  [HTTP.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HTTP.GATEWAY_TIMEOUT]: 'Gateway Timeout',
};
