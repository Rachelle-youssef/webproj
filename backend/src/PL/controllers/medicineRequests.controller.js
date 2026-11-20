'use strict';

const requests = require('../../BLL/medicineRequests.bll');
const { toPageRequest } = require('../validators/common.validators');
const { created, ok, page } = require('../respond');
async function list(req, res) {
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await requests.list(req.user, req.valid.status, pagination);
  return page(res, result);
}

async function submit(req, res) {
  const result = await requests.submit(req.user, req.valid);
  return created(res, result);
}

async function dispense(req, res) {
  const result = await requests.dispense(req.user, req.valid.id, req.ip);
  return ok(res, result);
}

module.exports = {
  list,
  submit,
  dispense
};
