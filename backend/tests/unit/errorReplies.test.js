// The PL is the only place that turns business error codes into HTTP statuses.
'use strict';

const { toReply } = require('../../src/PL/middleware/errorHandler');
const errors = require('../../src/shared/errors');
describe('error replies', () => {
  test.each([
    [
      new errors.ValidationError('Bad.', [
        {
          field: 'email',
          message: 'Invalid value'
        }
      ]),
      400,
      'VALIDATION_ERROR'
    ],
    [new errors.UnauthenticatedError(), 401, 'UNAUTHENTICATED'],
    [new errors.ForbiddenError(), 403, 'FORBIDDEN'],
    [new errors.AppError('ACCOUNT_DISABLED', 'x'), 403, 'ACCOUNT_DISABLED'],
    [new errors.AppError('CSRF_HEADER_MISSING', 'x'), 403, 'CSRF_HEADER_MISSING'],
    [new errors.NotFoundError(), 404, 'NOT_FOUND'],
    [new errors.ConflictError('x'), 409, 'CONFLICT'],
    [new errors.AppError('RATE_LIMITED', 'x'), 429, 'RATE_LIMITED'],
    [new errors.ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE']
  ])('%s -> HTTP %i', (err, status, code) => {
    const [s, body] = toReply(err);
    expect(s).toBe(status);
    expect(body.code).toBe(code);
  });
  test('keeps the field details of a validation error', () => {
    const [, body] = toReply(
      new errors.ValidationError('Bad.', [
        {
          field: 'email',
          message: 'Invalid value'
        }
      ])
    );
    expect(body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Bad.',
      details: [
        {
          field: 'email',
          message: 'Invalid value'
        }
      ]
    });
  });
  test('hides the details of unexpected errors, including raw MySQL errors', () => {
    expect(toReply(new Error('secret stack info'))).toEqual([
      500,
      {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side.'
      }
    ]);
    expect(
      toReply(
        Object.assign(new Error("Table 'users' ..."), {
          code: 'ER_BAD_FIELD_ERROR'
        })
      )[0]
    ).toBe(500);
  });
});
