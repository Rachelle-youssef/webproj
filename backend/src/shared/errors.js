// Errors that mean something to the business ("not found", "already exists").
// All three layers use them. They carry a code but no HTTP status:
// only the Presentation layer decides how each code becomes an HTTP reply.
'use strict';

class AppError extends Error {
  /**
   * @param {string} code     stable machine-readable code, e.g. NOT_FOUND
   * @param {string} message  sentence a user can read
   * @param {Array}  [details] per-field problems, e.g. [{ field: 'email', message: '...' }]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}
class ValidationError extends AppError {
  constructor(message = 'Some fields are not valid.', details) {
    super('VALIDATION_ERROR', message, details);
  }
}
class UnauthenticatedError extends AppError {
  constructor(message = 'Please log in.') {
    super('UNAUTHENTICATED', message);
  }
}
class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this action.') {
    super('FORBIDDEN', message);
  }
}
class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super('NOT_FOUND', message);
  }
}
class ConflictError extends AppError {
  constructor(message = 'This clashes with the current state.') {
    super('CONFLICT', message);
  }
}
class ServiceUnavailableError extends AppError {
  constructor(
    message = 'The service is temporarily unavailable. Please try again shortly.'
  ) {
    super('SERVICE_UNAVAILABLE', message);
  }
}
module.exports = {
  AppError,
  ValidationError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError
};
