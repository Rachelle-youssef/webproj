'use strict';

const medicinesDAL = require('../DAL/medicines.dal');
const config = require('../config');
const { today } = require('./dates');
const { notice } = require('./notices');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { PageDTO } = require('../DTO/common.dto');
const { ValidationError, NotFoundError, ConflictError } = require('../shared/errors');

async function list(user, status, page) {
  const { rows, total } = await medicinesDAL.list(
    user.role === 'admin' ? null : user.id,
    status,
    page
  );
  return new PageDTO(rows, page, total);
}

function submit(user, input) {
  if (input.expiry_date <= today(config.timeZone)) {
    throw new ValidationError('Expiry date must be after today.');
  }
  return medicinesDAL.submit(
    user.id,
    input,
    notice('medicine', 'A medicine donation is awaiting review.', '#/queue')
  );
}

function review(user, id, input, ip) {
  const status = input.decision === 'approve' ? 'approved' : 'rejected';
  return medicinesDAL.review(
    id,
    user.id,
    status,
    input.note || null,
    today(config.timeZone),
    notice('medicine', 'Your medicine donation was ' + status + '.', '#/donations'),
    new AuditEntryDTO({
      userId: user.id,
      action: 'medicine.' + status,
      entity: 'medicine',
      entityId: id,
      ip
    })
  );
}

async function get(id) {
  const batch = await medicinesDAL.findById(id);
  if (!batch) {
    throw new NotFoundError('Medicine donation not found.');
  }
  return batch;
}

async function qrPayload(id) {
  const batch = await get(id);
  if (batch.status !== 'approved') {
    throw new ConflictError('Only approved medicine batches have a QR label.');
  }
  return 'lifelink:medication:' + batch.id + ':exp:' + batch.expiry_date;
}
module.exports = {
  categories: medicinesDAL.categories,
  list,
  submit,
  review,
  get,
  qrPayload
};
