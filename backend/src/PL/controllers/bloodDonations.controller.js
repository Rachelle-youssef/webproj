// PL: /blood-donations. Each function: validated input -> DTO -> BLL -> reply.
'use strict';

const donationsBLL = require('../../BLL/bloodDonations.bll');
const {
  DonationOfferDTO,
  InvitationAnswerDTO,
  NoteDTO,
  DonationFilterDTO
} = require('../../DTO/blood.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, page, created } = require('../respond');
async function eligibility(req, res) {
  const result = await donationsBLL.eligibility(req.user);
  ok(res, result);
}

async function offer(req, res) {
  const input = new DonationOfferDTO(req.valid);
  const result = await donationsBLL.offer(req.user, input);
  created(res, result);
}

async function list(req, res) {
  const filter = new DonationFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await donationsBLL.list(req.user, filter, pagination);
  page(res, result);
}

async function respond(req, res) {
  const input = new InvitationAnswerDTO(req.valid);
  const result = await donationsBLL.respond(req.user, req.valid.id, input);
  ok(res, result);
}

async function withdraw(req, res) {
  const result = await donationsBLL.withdraw(req.user, req.valid.id);
  ok(res, result);
}

async function accept(req, res) {
  const result = await donationsBLL.accept(req.user, req.valid.id, req.ip);
  ok(res, result);
}

async function confirm(req, res) {
  const result = await donationsBLL.confirm(req.user, req.valid.id, req.ip);
  ok(res, result);
}

async function cancel(req, res) {
  const input = new NoteDTO(req.valid);
  const result = await donationsBLL.cancel(req.user, req.valid.id, input, req.ip);
  ok(res, result);
}

module.exports = {
  eligibility,
  offer,
  list,
  respond,
  withdraw,
  accept,
  confirm,
  cancel
};
