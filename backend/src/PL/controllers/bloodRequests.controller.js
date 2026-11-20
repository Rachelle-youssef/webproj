// PL: /blood-requests. Each function: validated input -> DTO -> BLL -> reply.
'use strict';

const requestsBLL = require('../../BLL/bloodRequests.bll');
const donationsBLL = require('../../BLL/bloodDonations.bll');
const {
  BloodRequestInputDTO,
  BloodRequestFilterDTO,
  ReviewDTO,
  NoteDTO,
  RequestLocationDTO,
  DispenseDTO,
  InvitationDTO
} = require('../../DTO/blood.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, page, created } = require('../respond');
async function create(req, res) {
  const input = new BloodRequestInputDTO(req.valid);
  const result = await requestsBLL.create(req.user, input, req.ip);
  created(res, result);
}

async function list(req, res) {
  const filter = new BloodRequestFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-urgency');
  const result = await requestsBLL.list(req.user, filter, pagination);
  page(res, result);
}

async function getOne(req, res) {
  const result = await requestsBLL.get(req.user, req.valid.id);
  ok(res, result);
}

async function review(req, res) {
  const input = new ReviewDTO(req.valid);
  const result = await requestsBLL.review(req.user, req.valid.id, input, req.ip);
  ok(res, result);
}

async function cancel(req, res) {
  const input = new NoteDTO(req.valid);
  const result = await requestsBLL.cancel(req.user, req.valid.id, input, req.ip);
  ok(res, result);
}

async function matches(req, res) {
  const result = await requestsBLL.matches(req.valid.id, req.valid.limit);
  ok(res, result);
}

async function dispense(req, res) {
  const input = new DispenseDTO(req.valid);
  const result = await requestsBLL.dispense(req.user, req.valid.id, input, req.ip);
  ok(res, result);
}

async function invite(req, res) {
  const input = new InvitationDTO(req.valid);
  const result = await donationsBLL.invite(req.user, req.valid.id, input, req.ip);
  created(res, result);
}

async function updateLocation(req, res) {
  const input = new RequestLocationDTO(req.valid);
  const result = await requestsBLL.updateLocation(req.user, req.valid.id, input, req.ip);
  ok(res, result);
}

module.exports = {
  create,
  list,
  getOne,
  review,
  cancel,
  matches,
  dispense,
  invite,
  updateLocation
};
