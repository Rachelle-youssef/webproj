// PL: turns every error into the standard reply  { "error": { "code", "message", "details"? } }.
// The BLL and DAL only say WHAT went wrong (an error code); this is the one place that
// decides the HTTP status. Unexpected errors are logged in full on the server, but the
// client only sees a generic message, so stack traces and SQL never leak out.
'use strict';

const { AppError } = require('../../shared/errors');
const HTTP_STATUS = {
  VALIDATION_ERROR: 400,
  BAD_JSON: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ACCOUNT_DISABLED: 403,
  CSRF_HEADER_MISSING: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503
};

function toReply(err) {
  if (err instanceof AppError) {
    return [
      HTTP_STATUS[err.code] ?? 500,
      {
        code: err.code,
        message: err.message,
        ...(err.details && {
          details: err.details
        })
      }
    ];
  }
  // Problems found by express.json() while reading the request body
  if (err.type === 'entity.parse.failed') {
    return [
      400,
      {
        code: 'BAD_JSON',
        message: 'The request body is not valid JSON.'
      }
    ];
  }
  if (err.type === 'entity.too.large') {
    return [
      413,
      {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large.'
      }
    ];
  }
  return [
    500,
    {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.'
    }
  ];
}

// eslint-disable-next-line no-unused-vars -- Express recognises error handlers by their 4 parameters
function errorHandler(err, req, res, next) {
  const [status, body] = toReply(err);
  if (status >= 500) {
    console.error(
      `[${new Date().toISOString()}] ${req.method} ${req.path} failed:`,
      err.cause || err
    );
  }
  res.status(status).json({
    error: body
  });
}

function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No endpoint ${req.method} ${req.path}.`
    }
  });
}
module.exports = {
  errorHandler,
  notFound,
  toReply,
  HTTP_STATUS
};
