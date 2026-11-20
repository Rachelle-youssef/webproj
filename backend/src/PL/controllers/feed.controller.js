'use strict';

const feedBLL = require('../../BLL/feed.bll');
const { CommunityFilterDTO } = require('../../DTO/community.dto');
const { BloodRequestFilterDTO } = require('../../DTO/blood.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, page } = require('../respond');
async function list(req, res) {
  const filter = new CommunityFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-at');
  const result = await feedBLL.list(filter, pagination);
  return page(res, result);
}

async function stats(req, res) {
  const result = await feedBLL.stats();
  return ok(res, result);
}

async function map(req, res) {
  const pagination = toPageRequest(req.valid, '-created_at');
  const filter = new BloodRequestFilterDTO(req.valid);
  const result = await feedBLL.map(pagination, filter);
  return page(res, result);
}

module.exports = {
  list,
  stats,
  map
};
