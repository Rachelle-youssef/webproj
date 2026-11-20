// PL: cross-site request forgery (CSRF) defence for cookie sessions.
// Every request that changes data must carry the header  X-Requested-With: LifeLink.
// A page on another site cannot add a custom header without passing our CORS check,
// so forged requests are refused here.
'use strict';

const { AppError } = require('../../shared/errors');
const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'LifeLink';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requireCsrfHeader(req, res, next) {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_VALUE) {
    return next();
  }
  return next(
    new AppError(
      'CSRF_HEADER_MISSING',
      `Requests that change data must send the header ${CSRF_HEADER}: ${CSRF_VALUE}.`
    )
  );
}
module.exports = {
  requireCsrfHeader,
  CSRF_HEADER,
  CSRF_VALUE
};
