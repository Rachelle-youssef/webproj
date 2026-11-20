'use strict';

const medicineRequestsDAL = require('../DAL/medicineRequests.dal');
const config = require('../config');
const { today } = require('./dates');
const { notice } = require('./notices');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { PageDTO } = require('../DTO/common.dto');

async function available(page) {
  const { rows, total } = await medicineRequestsDAL.available(
    today(config.timeZone),
    page
  );
  return new PageDTO(rows, page, total);
}

async function list(user, status, page) {
  const requesterId = user.role === 'admin' ? null : user.id;
  const { rows, total } = await medicineRequestsDAL.list(requesterId, status, page);
  return new PageDTO(rows, page, total);
}

function submit(user, input) {
  return medicineRequestsDAL.submit(
    user.id,
    input,
    today(config.timeZone),
    notice('medicine', 'A medicine request is awaiting review.', '#/queue')
  );
}

function dispense(user, id, ip) {
  return medicineRequestsDAL.dispense(
    id,
    user.id,
    today(config.timeZone),
    notice('medicine', 'Your requested medicine was dispensed.'),
    new AuditEntryDTO({
      userId: user.id,
      action: 'medicine_request.dispensed',
      entity: 'medicine_request',
      entityId: id,
      ip
    })
  );
}
module.exports = {
  available,
  list,
  submit,
  dispense
};
