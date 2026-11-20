// BLL: the rules for signing up, signing in, and checking a session.
'use strict';

const usersDAL = require('../DAL/users.dal');
const requestsDAL = require('../DAL/bloodRequests.dal');
const auditDAL = require('../DAL/audit.dal');
const { hashPassword, verifyPassword, burnTime } = require('./password');
const {
  AppError,
  ConflictError,
  UnauthenticatedError,
  ValidationError
} = require('../shared/errors');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { AuthResultDTO } = require('../DTO/user.dto');

/** @param {import('../DTO/user.dto').RegisterDTO} account */
async function register(account, ip) {
  if (await usersDAL.emailExists(account.email)) {
    throw new ConflictError('An account with this email already exists.');
  }
  if (account.role === 'hospital') {
    const hasCoordinates =
      Number.isFinite(account.latitude) && Number.isFinite(account.longitude);
    if (!hasCoordinates) {
      throw new ValidationError('Select your hospital location on the Lebanon map.');
    }
    const isInsideLebanon = await requestsDAL.isLebanonLocation(
      account.latitude,
      account.longitude
    );
    if (!isInsideLebanon) {
      throw new ValidationError('Select your hospital location on the Lebanon map.');
    }
  }
  const passwordHash = await hashPassword(account.password);
  const user = await usersDAL.createAccount(
    account,
    passwordHash,
    new AuditEntryDTO({
      action: 'auth.registered',
      entity: 'user',
      ip
    })
  );
  return new AuthResultDTO(user, 0);
}

/** Used only by the "npm run admin:create" script: admins cannot sign up through the website. */
async function createAdmin(account) {
  if (account.role !== 'admin') {
    throw new ValidationError('createAdmin only creates admin accounts.');
  }
  if (account.password.length < 12) {
    throw new ValidationError('Admin passwords need at least 12 characters.');
  }
  if (await usersDAL.emailExists(account.email)) {
    throw new ConflictError(`An account with ${account.email} already exists.`);
  }
  const passwordHash = await hashPassword(account.password);
  return usersDAL.createAccount(
    account,
    passwordHash,
    new AuditEntryDTO({
      action: 'auth.admin_created',
      entity: 'user'
    })
  );
}

/** @param {import('../DTO/user.dto').LoginDTO} credentials */
async function login({ email, password }, ip) {
  const account = await usersDAL.findCredentialsByEmail(email);
  if (!account) {
    await burnTime(password); // same delay as a real check, so unknown emails cannot be detected
    await auditDAL.record(
      new AuditEntryDTO({
        action: 'auth.login_failed',
        ip
      })
    );
    throw new UnauthenticatedError('Email or password is incorrect.');
  }
  const passwordMatches = await verifyPassword(password, account.password_hash);
  if (!passwordMatches) {
    await auditDAL.record(
      new AuditEntryDTO({
        userId: account.id,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: account.id,
        ip
      })
    );
    throw new UnauthenticatedError('Email or password is incorrect.');
  }
  if (!account.is_active) {
    // Only revealed to someone who knows the right password.
    throw new AppError(
      'ACCOUNT_DISABLED',
      'This account has been deactivated. Contact the LifeLink team.'
    );
  }
  await auditDAL.record(
    new AuditEntryDTO({
      userId: account.id,
      action: 'auth.login',
      entity: 'user',
      entityId: account.id,
      ip
    })
  );
  const user = await usersDAL.findById(account.id);
  return new AuthResultDTO(user, account.session_version);
}

/**
 * Called on every signed-in request. The user is re-read each time, so a deactivation
 * or a password change takes effect at once instead of when the session expires.
 */
async function getSessionUser(userId, sessionVersion) {
  const user = await usersDAL.findSessionUser(userId);
  if (!user || !user.is_active) {
    throw new UnauthenticatedError(
      'Your session is no longer valid. Please log in again.'
    );
  }
  if (user.session_version !== sessionVersion) {
    throw new UnauthenticatedError(
      'Your password was changed, so this session ended. Please log in again.'
    );
  }
  return user;
}
module.exports = {
  register,
  createAdmin,
  login,
  getSessionUser
};
