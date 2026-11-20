'use strict';

const adminBLL = require('../../BLL/admin.bll');
const { CommunityFilterDTO } = require('../../DTO/community.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, page } = require('../respond');
async function stats(req, res) {
  const result = await adminBLL.stats(req.user);
  return ok(res, result);
}

async function audit(req, res) {
  const filter = new CommunityFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await adminBLL.auditLogs(req.user, filter, pagination);
  return page(res, result);
}

module.exports = {
  stats,
  audit
};
