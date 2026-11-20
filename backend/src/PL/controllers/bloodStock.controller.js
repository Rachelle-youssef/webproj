// PL: /blood-stock.
'use strict';

const stockBLL = require('../../BLL/bloodStock.bll');
const { StockAdjustmentDTO, MovementFilterDTO } = require('../../DTO/blood.dto');
const { toPageRequest } = require('../validators/common.validators');
const { ok, page, created } = require('../respond');
async function levels(req, res) {
  const result = await stockBLL.levels();
  ok(res, result);
}

async function movements(req, res) {
  const filter = new MovementFilterDTO(req.valid);
  const pagination = toPageRequest(req.valid, '-created_at');
  const result = await stockBLL.movements(filter, pagination);
  page(res, result);
}

async function adjust(req, res) {
  const input = new StockAdjustmentDTO(req.valid);
  const result = await stockBLL.adjust(req.user, input, req.ip);
  created(res, result);
}

module.exports = {
  levels,
  movements,
  adjust
};
