// PL: /users requests. Each function: validated input -> DTO -> BLL -> reply.
'use strict';

const usersBLL = require('../../BLL/users.bll');
const {
  ProfileUpdateDTO,
  PasswordChangeDTO,
  UserFilterDTO
} = require('../../DTO/user.dto');
const { toPageRequest } = require('../validators/common.validators');
const { startSession } = require('../session');
const { ok, page, noContent } = require('../respond');
async function updateMe(req, res) {
  const input = new ProfileUpdateDTO(req.valid);
  const result = await usersBLL.updateProfile(req.user, input);
  ok(res, result);
}

async function changeMyPassword(req, res) {
  const input = new PasswordChangeDTO(req.valid);
  const sessionVersion = await usersBLL.changePassword(req.user, input, req.ip);
  await startSession(req, req.user, sessionVersion); // other devices are signed out; this one continues
  noContent(res);
}

async function list(req, res) {
  const filter = new UserFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await usersBLL.listUsers(filter, pagination);
  page(res, result);
}

async function getOne(req, res) {
  const result = await usersBLL.getProfile(req.valid.id);
  ok(res, result);
}

async function setStatus(req, res) {
  const result = await usersBLL.setStatus(
    req.user,
    req.valid.id,
    req.valid.is_active,
    req.ip
  );
  ok(res, result);
}

module.exports = {
  updateMe,
  changeMyPassword,
  list,
  getOne,
  setStatus
};
