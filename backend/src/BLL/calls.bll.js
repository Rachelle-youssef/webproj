'use strict';

const callsDAL = require('../DAL/calls.dal');
const { PageDTO } = require('../DTO/common.dto');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { ForbiddenError, NotFoundError } = require('../shared/errors');
const { notice } = require('./notices');
const { today } = require('./dates');
const { eligibilityCutoff } = require('./bloodRules');
const config = require('../config');

function adminOnly(user) {
  if (user.role !== 'admin') {
    throw new ForbiddenError();
  }
}

async function list(user, filter, page) {
  const result = await callsDAL.list(
    {
      ...filter,
      status: user.role === 'admin' ? filter.status || 'open' : 'open'
    },
    page
  );
  return new PageDTO(result.rows, page, result.total);
}

async function get(user, id) {
  const call = await callsDAL.findById(id);
  if (!call || (user.role !== 'admin' && call.status !== 'open')) {
    throw new NotFoundError('Medicine call not found.');
  }
  return call;
}

async function createMedicine(admin, input, ip) {
  adminOnly(admin);
  return callsDAL.createMedicine(
    input,
    admin.id,
    notice(
      'medicine',
      `LifeLink needs ${input.quantity} x ${input.medicine_name}. Open donation requests to help.`,
      '#/calls'
    ),
    new AuditEntryDTO({
      userId: admin.id,
      action: 'call.medicine_created',
      entity: 'medicine_call',
      ip
    })
  );
}

async function createBlood(admin, input, ip) {
  adminOnly(admin);
  return callsDAL.createBlood(
    input,
    admin.id,
    eligibilityCutoff(today(config.timeZone)),
    notice(
      input.urgency === 'sos' ? 'sos' : 'invite',
      `${input.urgency === 'sos' ? 'SOS: ' : ''}${input.units_needed} blood unit(s) needed at ${input.hospital_name}${input.city ? ', ' + input.city : ''}. Can you help?`
    ),
    new AuditEntryDTO({
      userId: admin.id,
      action: 'call.blood_created',
      entity: 'blood_request',
      ip
    })
  );
}

async function close(admin, id, ip) {
  adminOnly(admin);
  return callsDAL.close(
    id,
    new AuditEntryDTO({
      userId: admin.id,
      action: 'call.closed',
      entity: 'medicine_call',
      entityId: id,
      ip
    })
  );
}
module.exports = {
  list,
  get,
  createMedicine,
  createBlood,
  close
};
