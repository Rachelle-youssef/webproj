// BLL: the rules for blood requests: who may create, see, review and cancel them,
// who gets alerted, and how units from the blood bank are given to a request.
'use strict';

const requestsDAL = require('../DAL/bloodRequests.dal');
const donationsDAL = require('../DAL/bloodDonations.dal');
const usersDAL = require('../DAL/users.dal');
const config = require('../config');
const rules = require('./bloodRules');
const { today } = require('./dates');
const { notice } = require('./notices');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { PageDTO } = require('../DTO/common.dto');
const { OpenBloodRequestDTO } = require('../DTO/blood.dto');
const { ConflictError, NotFoundError, ValidationError } = require('../shared/errors');
const link = (id) => `#/blood-requests/${id}`;
const where = (request) =>
  request.city ? `${request.hospital_name}, ${request.city}` : request.hospital_name;

async function getOrFail(id) {
  const request = await requestsDAL.findById(id);
  if (!request) {
    throw new NotFoundError('Blood request not found.');
  }
  return request;
}

/** @param {import('../DTO/blood.dto').BloodRequestInputDTO} input */
async function create(user, input, ip) {
  const activeRequests = await requestsDAL.countActive(user.id);
  if (activeRequests >= rules.MAX_ACTIVE_REQUESTS) {
    throw new ConflictError(
      `You already have ${rules.MAX_ACTIVE_REQUESTS} active requests. Cancel one or wait until one is fulfilled.`
    );
  }
  // Only hospitals reuse their saved hospital location; patients choose the treating hospital.
  const profile = await usersDAL.findById(user.id);
  const request = {
    ...input
  };
  if (!request.city && user.role === 'hospital') {
    request.city = profile.city;
  }
  if (request.latitude === null && user.role === 'hospital') {
    request.latitude = profile.latitude;
    request.longitude = profile.longitude;
  }
  request.has_hospital_pin = request.latitude !== null && request.longitude !== null;
  return requestsDAL.create(request, user.id, {
    adminNotice: notice(
      'request',
      `New blood request: ${request.units_needed} unit(s), ${request.urgency}, at ${where(request)}. Please review it.`,
      '#/queue'
    ),
    auditEntry: new AuditEntryDTO({
      userId: user.id,
      action: 'blood_request.created',
      entity: 'blood_request',
      ip
    })
  });
}

/** Admins see everything, requesters their own, donors the open requests they can give to. */
async function list(user, filter, page) {
  let result;
  if (user.role === 'admin') {
    result = await requestsDAL.listAll(filter, page);
  } else if (user.role === 'donor') {
    const donor = await usersDAL.findById(user.id);
    result = await requestsDAL.listOpenForDonor(
      {
        donorId: user.id,
        bloodTypeId: donor.donor.blood_type_id
      },
      filter,
      page
    );
  } else {
    result = await requestsDAL.listByRequester(user.id, filter, page);
  }
  return new PageDTO(result.rows, page, result.total);
}

/** Anyone who may not see a request gets "not found", so its existence is not revealed. */
async function get(user, id) {
  const request = await getOrFail(id);
  if (user.role === 'admin' || request.requester.id === user.id) {
    return request;
  }
  if (user.role === 'donor' && request.status === 'open') {
    const donor = await usersDAL.findById(user.id);
    const isCompatible = await requestsDAL.isCompatible(
      donor.donor.blood_type_id,
      request.blood_type_id
    );
    if (isCompatible) {
      const mine = await donationsDAL.findByRequestAndDonor(id, user.id);
      return new OpenBloodRequestDTO({
        ...request,
        my_response: mine ? mine.status : null,
        can_offer_again: mine?.can_offer_again || false
      });
    }
  }
  throw new NotFoundError('Blood request not found.');
}

async function matches(id, limit = rules.MATCH_LIMIT) {
  const request = await getOrFail(id);
  if (!['pending', 'open'].includes(request.status)) {
    throw new ConflictError('Only pending or open requests need donors.');
  }
  return requestsDAL.findMatches({
    requestId: id,
    recipientBloodTypeId: request.blood_type_id,
    latitude: request.latitude,
    longitude: request.longitude,
    cutoffDate: rules.eligibilityCutoff(today(config.timeZone)),
    limit
  });
}

async function updateLocation(user, id, { latitude, longitude }, ip) {
  await get(user, id);
  if (!(await requestsDAL.isLebanonLocation(latitude, longitude))) {
    throw new ValidationError('Select a hospital location inside Lebanon.');
  }
  return requestsDAL.updateLocation({
    requestId: id,
    userId: user.id,
    isAdmin: user.role === 'admin',
    latitude,
    longitude,
    auditEntry: new AuditEntryDTO({
      userId: user.id,
      action: 'blood_request.location_updated',
      entity: 'blood_request',
      entityId: id,
      ip
    })
  });
}

/** @param {import('../DTO/blood.dto').ReviewDTO} decision */
async function review(admin, id, { decision, note }, ip) {
  const request = await getOrFail(id);
  if (request.status !== 'pending') {
    throw new ConflictError('This request has already been reviewed.');
  }
  const approved = decision === 'approve';
  const notices = [
    approved
      ? notice(
          'request',
          `Your request for ${request.units_needed} unit(s) of ${request.blood_type} was approved and is now visible to donors.`,
          link(id),
          request.requester.id
        )
      : notice(
          'request',
          `Your blood request was not approved: ${note}`,
          link(id),
          request.requester.id
        )
  ];

  // An approved SOS request alerts every donor who could give blood for it right now.
  if (approved && request.urgency === 'sos') {
    const donors = await matches(id, rules.SOS_ALERT_LIMIT);
    notices.push(
      ...donors.map((d) =>
        notice(
          'sos',
          `SOS: ${where(request)} urgently needs ${request.blood_type} blood. Can you help?`,
          link(id),
          d.donor_id
        )
      )
    );
  }
  return requestsDAL.review({
    requestId: id,
    status: approved ? 'open' : 'cancelled',
    note,
    reviewedBy: admin.id,
    notices,
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: approved ? 'blood_request.approved' : 'blood_request.denied',
      entity: 'blood_request',
      entityId: id,
      ip
    })
  });
}

/** The requester or an admin cancels; donors still waiting on the request are told. */
async function cancel(user, id, { note }, ip) {
  const request = await getOrFail(id);
  const isOwner = request.requester.id === user.id;
  if (!isOwner && user.role !== 'admin') {
    throw new NotFoundError('Blood request not found.');
  }
  if (!['pending', 'open'].includes(request.status)) {
    throw new ConflictError('Only pending or open requests can be cancelled.');
  }
  const waiting = await donationsDAL.listOpenForRequest(id);
  const notices = waiting.map((d) =>
    notice(
      'request',
      `The request at ${where(request)} was cancelled. ${d.status === 'invited' ? 'Your invitation has been withdrawn.' : 'Your offer is no longer needed.'}`,
      '#/donations',
      d.donor.id
    )
  );
  if (!isOwner) {
    notices.push(
      notice(
        'request',
        `Your blood request was cancelled by LifeLink${note ? `: ${note}` : '.'}`,
        link(id),
        request.requester.id
      )
    );
  }
  return requestsDAL.cancel({
    requestId: id,
    note,
    notices,
    auditEntry: new AuditEntryDTO({
      userId: user.id,
      action: 'blood_request.cancelled',
      entity: 'blood_request',
      entityId: id,
      ip
    })
  });
}

/** How a request moves forward when it receives units. */
function progressFor(request, units) {
  const newReceived = request.units_received + units;
  return {
    requestId: request.id,
    expectedReceived: request.units_received,
    newReceived,
    newStatus: newReceived >= request.units_needed ? 'fulfilled' : 'open'
  };
}

function progressNotice(request, progress, how) {
  return progress.newStatus === 'fulfilled'
    ? notice(
        'donation',
        `Your request at ${where(request)} is fulfilled: all ${request.units_needed} unit(s) were ${how}.`,
        link(request.id),
        request.requester.id
      )
    : notice(
        'donation',
        `Blood was ${how} for your request at ${where(request)} (${progress.newReceived} of ${request.units_needed} units).`,
        link(request.id),
        request.requester.id
      );
}

/** An admin gives units from the blood bank to an open request. */
async function dispense(admin, id, { blood_type_id, units, note }, ip) {
  const request = await getOrFail(id);
  if (request.status !== 'open') {
    throw new ConflictError('Only an open request can receive units.');
  }
  if (!(await requestsDAL.isCompatible(blood_type_id, request.blood_type_id))) {
    throw new ValidationError('Some fields are not valid.', [
      {
        field: 'blood_type_id',
        message: `this blood type cannot be given for a ${request.blood_type} request`
      }
    ]);
  }
  const remaining = request.units_needed - request.units_received;
  if (units > remaining) {
    throw new ValidationError('Some fields are not valid.', [
      {
        field: 'units',
        message: `must be at most ${remaining}, the units still needed`
      }
    ]);
  }
  const progress = progressFor(request, units);
  return requestsDAL.dispense({
    bloodTypeId: blood_type_id,
    units,
    note,
    createdBy: admin.id,
    progress,
    notices: [progressNotice(request, progress, 'provided by the blood bank')],
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: 'blood_stock.dispensed',
      entity: 'blood_request',
      entityId: id,
      ip
    })
  });
}
module.exports = {
  create,
  list,
  get,
  matches,
  review,
  cancel,
  dispense,
  progressFor,
  progressNotice,
  where,
  updateLocation
};
