'use strict';

const QRCode = require('qrcode');
const medicines = require('../../BLL/medicines.bll');
const requests = require('../../BLL/medicineRequests.bll');
const { toPageRequest } = require('../validators/common.validators');
const { ok, created, page } = require('../respond');
async function categories(req, res) {
  const result = await medicines.categories();
  return ok(res, result);
}

async function list(req, res) {
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await medicines.list(req.user, req.valid.status, pagination);
  return page(res, result);
}

async function submit(req, res) {
  const result = await medicines.submit(req.user, req.valid);
  return created(res, result);
}

async function review(req, res) {
  const result = await medicines.review(req.user, req.valid.id, req.valid, req.ip);
  return ok(res, result);
}

async function available(req, res) {
  const pagination = toPageRequest(req.valid, 'expiry_date');
  const result = await requests.available(pagination);
  return page(res, result);
}

async function get(req, res) {
  const result = await medicines.get(req.valid.id);
  return ok(res, result);
}

async function qr(req, res) {
  const payload = await medicines.qrPayload(req.valid.id);
  const png = await QRCode.toBuffer(payload);
  return res.set('Cache-Control', 'private, no-store').type('png').send(png);
}

module.exports = {
  categories,
  list,
  submit,
  review,
  available,
  get,
  qr
};
