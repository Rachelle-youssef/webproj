'use strict';

const callsBLL = require('../../BLL/calls.bll');
const { CallInputDTO, CommunityFilterDTO } = require('../../DTO/community.dto');
const { BloodRequestInputDTO } = require('../../DTO/blood.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, created, page } = require('../respond');
async function list(req, res) {
  const filter = new CommunityFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await callsBLL.list(req.user, filter, pagination);
  return page(res, result);
}

async function get(req, res) {
  const result = await callsBLL.get(req.user, req.valid.id);
  return ok(res, result);
}

async function createMedicine(req, res) {
  const input = new CallInputDTO(req.valid);
  const result = await callsBLL.createMedicine(req.user, input, req.ip);
  return created(res, result);
}

async function createBlood(req, res) {
  const input = new BloodRequestInputDTO(req.valid);
  const result = await callsBLL.createBlood(req.user, input, req.ip);
  return created(res, result);
}

async function close(req, res) {
  const result = await callsBLL.close(req.user, req.valid.id, req.ip);
  return ok(res, result);
}

module.exports = {
  list,
  get,
  createMedicine,
  createBlood,
  close
};
