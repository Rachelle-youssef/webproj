// PL: authentication (who are you?) and authorization (may you do this?).
//
//   router.get('/x', authenticate, handler)                     any signed-in user
//   router.post('/y', authenticate, requireRole('admin'), ...)  admins only
//
// Following the 3-tier rules, this asks the BLL to check the session;
// it never reads the database itself.
'use strict';

const authBLL = require('../../BLL/auth.bll');
const { readSession } = require('../session');
const { UnauthenticatedError, ForbiddenError } = require('../../shared/errors');

async function authenticate(req, res, next) {
  const session = readSession(req);
  if (!session) {
    throw new UnauthenticatedError();
  }
  req.user = await authBLL.getSessionUser(session.userId, session.sessionVersion); // a SessionUserDTO
  next();
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user?.role) ? next() : next(new ForbiddenError());
}
module.exports = {
  authenticate,
  requireRole
};
