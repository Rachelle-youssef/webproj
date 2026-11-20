'use strict';

const adminDAL = require('../DAL/admin.dal');
const { PageDTO } = require('../DTO/common.dto');
const { ForbiddenError } = require('../shared/errors');

function requireAdmin(user) {
  if (user.role !== 'admin') {
    throw new ForbiddenError();
  }
}

async function stats(user) {
  requireAdmin(user);
  return adminDAL.stats();
}

async function auditLogs(user, filter, page) {
  requireAdmin(user);
  const result = await adminDAL.auditLogs(filter, page);
  return new PageDTO(result.rows, page, result.total);
}
module.exports = {
  stats,
  auditLogs
};
