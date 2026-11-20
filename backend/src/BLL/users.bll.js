// BLL: the rules for profiles, passwords and admin account management.
'use strict';

const usersDAL = require('../DAL/users.dal');
const requestsDAL = require('../DAL/bloodRequests.dal');
const auditDAL = require('../DAL/audit.dal');
const { hashPassword, verifyPassword } = require('./password');
const { ValidationError, NotFoundError, ForbiddenError } = require('../shared/errors');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { PageDTO } = require('../DTO/common.dto');

async function getProfile(id) {
  const user = await usersDAL.findById(id);
  if (!user) {
    throw new NotFoundError('User not found.');
  }
  return user;
}

/** @param {import('../DTO/user.dto').SessionUserDTO} user  @param {import('../DTO/user.dto').ProfileUpdateDTO} changes */
async function updateProfile(user, changes) {
  if (Object.hasOwn(changes, 'is_available') && user.role !== 'donor') {
    throw new ValidationError('Some fields are not valid.', [
      {
        field: 'is_available',
        message: 'only donors have an availability setting'
      }
    ]);
  }
  if (user.role === 'hospital' && Object.hasOwn(changes, 'latitude')) {
    const hasCoordinates =
      Number.isFinite(changes.latitude) && Number.isFinite(changes.longitude);
    if (!hasCoordinates) {
      throw new ValidationError('Select your hospital location inside Lebanon.');
    }
    const isInsideLebanon = await requestsDAL.isLebanonLocation(
      changes.latitude,
      changes.longitude
    );
    if (!isInsideLebanon) {
      throw new ValidationError('Select your hospital location inside Lebanon.');
    }
  }
  return usersDAL.updateProfile(user.id, changes);
}

/** Returns the new session version, so the PL can keep this device signed in. */
async function changePassword(user, { current_password, new_password }, ip) {
  const stored = await usersDAL.findPasswordHash(user.id);
  const passwordMatches = await verifyPassword(current_password, stored);
  if (!passwordMatches) {
    throw new ValidationError('Your current password is not correct.', [
      {
        field: 'current_password',
        message: 'is not correct'
      }
    ]);
  }
  if (current_password === new_password) {
    throw new ValidationError('Choose a password you have not used just now.', [
      {
        field: 'new_password',
        message: 'must differ from the current password'
      }
    ]);
  }
  const passwordHash = await hashPassword(new_password);
  const sessionVersion = await usersDAL.updatePassword(user.id, passwordHash);
  await auditDAL.record(
    new AuditEntryDTO({
      userId: user.id,
      action: 'user.password_changed',
      entity: 'user',
      entityId: user.id,
      ip
    })
  );
  return sessionVersion;
}

/** @returns {Promise<PageDTO>} */
async function listUsers(filter, page) {
  const { rows, total } = await usersDAL.list(filter, page);
  return new PageDTO(rows, page, total);
}

async function setStatus(admin, userId, isActive, ip) {
  if (admin.id === userId) {
    throw new ForbiddenError('You cannot deactivate your own account.');
  }
  const target = await usersDAL.findById(userId);
  if (!target) {
    throw new NotFoundError('User not found.');
  }
  await usersDAL.setActive(userId, isActive);
  await auditDAL.record(
    new AuditEntryDTO({
      userId: admin.id,
      action: isActive ? 'user.activated' : 'user.deactivated',
      entity: 'user',
      entityId: userId,
      ip
    })
  );
  return usersDAL.findById(userId);
}
module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  listUsers,
  setStatus
};
