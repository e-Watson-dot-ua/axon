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
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};
