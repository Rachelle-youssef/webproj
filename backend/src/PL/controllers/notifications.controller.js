'use strict';

const notificationsBLL = require('../../BLL/notifications.bll');
const { CommunityFilterDTO } = require('../../DTO/community.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, page, noContent } = require('../respond');
async function list(req, res) {
  const filter = new CommunityFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await notificationsBLL.list(req.user, filter, pagination);
  return page(res, result);
}

async function count(req, res) {
  const result = await notificationsBLL.unreadCount(req.user);
  return ok(res, result);
}

async function readAll(req, res) {
  const result = await notificationsBLL.readAll(req.user);
  return ok(res, result);
}

async function markRead(req, res) {
  await notificationsBLL.markRead(req.user, req.valid.id);
  noContent(res);
}

module.exports = {
  list,
  count,
  readAll,
  markRead
};
