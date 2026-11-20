// BLL: the blood bank's stock levels, history and manual corrections.
'use strict';

const stockDAL = require('../DAL/bloodStock.dal');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { PageDTO } = require('../DTO/common.dto');

async function levels() {
  return stockDAL.levels();
}

async function movements(filter, page) {
  const { rows, total } = await stockDAL.listMovements(filter, page);
  return new PageDTO(rows, page, total);
}

/** @param {import('../DTO/blood.dto').StockAdjustmentDTO} adjustment */
async function adjust(admin, adjustment, ip) {
  return stockDAL.adjust({
    bloodTypeId: adjustment.blood_type_id,
    changeUnits: adjustment.change_units,
    note: adjustment.note,
    createdBy: admin.id,
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: 'blood_stock.adjusted',
      entity: 'blood_type',
      entityId: adjustment.blood_type_id,
      ip
    })
  });
}
module.exports = {
  levels,
  movements,
  adjust
};
