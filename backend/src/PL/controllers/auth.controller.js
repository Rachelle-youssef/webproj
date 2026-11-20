// PL: /auth requests. Each function: validated input -> DTO -> BLL -> reply.
'use strict';

const authBLL = require('../../BLL/auth.bll');
const usersBLL = require('../../BLL/users.bll');
const { RegisterDTO, LoginDTO } = require('../../DTO/user.dto');
const { startSession, endSession } = require('../session');
const { ok, created, noContent } = require('../respond');
async function register(req, res) {
  const input = new RegisterDTO(req.valid);
  const { user, sessionVersion } = await authBLL.register(input, req.ip);
  await startSession(req, user, sessionVersion); // signed in straight after sign-up
  created(res, user);
}

async function login(req, res) {
  const input = new LoginDTO(req.valid);
  const { user, sessionVersion } = await authBLL.login(input, req.ip);
  await startSession(req, user, sessionVersion);
  ok(res, user);
}

async function logout(req, res) {
  await endSession(req, res);
  noContent(res);
}

async function me(req, res) {
  const result = await usersBLL.getProfile(req.user.id);
  ok(res, result);
}

module.exports = {
  register,
  login,
  logout,
  me
};
