// BLL: the rules for donations: eligibility (8 weeks between donations), compatibility,
// offers, invitations, answers, and what happens when an admin confirms a donation.
'use strict';

const donationsDAL = require('../DAL/bloodDonations.dal');
const requestsDAL = require('../DAL/bloodRequests.dal');
const usersDAL = require('../DAL/users.dal');
const config = require('../config');
const rules = require('./bloodRules');
const requestRules = require('./bloodRequests.bll');
const { today, addDays } = require('./dates');
const { notice } = require('./notices');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { PageDTO } = require('../DTO/common.dto');
const { EligibilityDTO } = require('../DTO/blood.dto');
const { ConflictError, NotFoundError, ForbiddenError } = require('../shared/errors');

async function donorOrFail(userId) {
  const user = await usersDAL.findById(userId);
  if (!user || user.role !== 'donor') {
    throw new NotFoundError('Donor not found.');
  }
  return user;
}

async function donationOrFail(id) {
  const donation = await donationsDAL.findById(id);
  if (!donation) {
    throw new NotFoundError('Donation not found.');
  }
  return donation;
}

function ensureEligible(donor, todayDate, who = 'You') {
  const e = rules.eligibility(donor.donor.last_donation_date, todayDate);
  if (!e.eligible) {
    throw new ConflictError(
      `${who} can donate again from ${e.next_eligible_date} (8 weeks after the last donation).`
    );
  }
}

async function eligibility(user) {
  const donor = await donorOrFail(user.id);
  const e = rules.eligibility(donor.donor.last_donation_date, today(config.timeZone));
  return new EligibilityDTO({
    ...e,
    last_donation_date: donor.donor.last_donation_date,
    interval_days: rules.DONATION_INTERVAL_DAYS
  });
}

/** A donor offers blood for an open request, or to the blood bank (no request). */
async function offer(user, { request_id }) {
  const donor = await donorOrFail(user.id);
  ensureEligible(donor, today(config.timeZone));
  let request = null;
  let withdrawnOffer = null;
  if (request_id) {
    request = await requestsDAL.findById(request_id);
    if (!request || request.status !== 'open') {
      throw new NotFoundError('This request is not open for donations.');
    }
    if (
      !(await requestsDAL.isCompatible(donor.donor.blood_type_id, request.blood_type_id))
    ) {
      throw new ConflictError(
        `Your blood type (${donor.donor.blood_type}) cannot be given for a ${request.blood_type} request.`
      );
    }
    const existing = await donationsDAL.findByRequestAndDonor(request_id, user.id);
    if (existing && !existing.can_offer_again)
      throw new ConflictError('You have already answered this request.');
    if (existing) withdrawnOffer = existing;
  } else {
    const existing = await donationsDAL.findActiveIndependent(user.id);
    if (existing?.status === 'pending') {
      throw new ConflictError(
        'Your blood-bank offer #' + existing.id + ' is pending admin review.'
      );
    }
    if (existing?.status === 'accepted') {
      throw new ConflictError(
        'Your blood-bank offer #' +
          existing.id +
          ' was accepted and is awaiting collection.'
      );
    }
  }
  const input = {
    donorId: user.id,
    requestId: request ? request.id : null,
    status: 'pending',
    notices: request
      ? [
          notice(
            'response',
            `A donor offered to give blood for your request at ${requestRules.where(request)}.`,
            `#/blood-requests/${request.id}`,
            request.requester.id
          )
        ]
      : [],
    adminNotice: notice(
      'donation',
      request
        ? `${donor.full_name} (${donor.donor.blood_type}) offered to donate for the request at ${requestRules.where(request)}.`
        : `${donor.full_name} (${donor.donor.blood_type}) offered to donate to the blood bank.`,
      '#/queue'
    )
  };
  return withdrawnOffer
    ? donationsDAL.reopenWithdrawn(withdrawnOffer.id, input)
    : donationsDAL.create(input);
}

/** An admin invites a matching donor to an open request. */
async function invite(admin, requestId, { donor_id }, ip) {
  const request = await requestsDAL.findById(requestId);
  if (!request) {
    throw new NotFoundError('Blood request not found.');
  }
  if (request.status !== 'open') {
    throw new ConflictError('Donors can only be invited to an open request.');
  }
  const donor = await donorOrFail(donor_id);
  if (!donor.is_active) {
    throw new ConflictError('This donor account is deactivated.');
  }
  if (!donor.donor.is_available) {
    throw new ConflictError('This donor has set themselves as unavailable.');
  }
  ensureEligible(donor, today(config.timeZone), 'This donor');
  if (
    !(await requestsDAL.isCompatible(donor.donor.blood_type_id, request.blood_type_id))
  ) {
    throw new ConflictError(
      `${donor.donor.blood_type} blood cannot be given for a ${request.blood_type} request.`
    );
  }
  if (await donationsDAL.findByRequestAndDonor(requestId, donor.id)) {
    throw new ConflictError(
      'This donor was already invited or has already answered this request.'
    );
  }
  return donationsDAL.create({
    donorId: donor.id,
    requestId,
    status: 'invited',
    notices: [
      notice(
        'invite',
        `LifeLink invites you to donate ${request.blood_type} blood at ${requestRules.where(request)}. Please accept or decline.`,
        '#/donations',
        donor.id
      )
    ],
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: 'blood_donation.invited',
      entity: 'blood_donation',
      ip
    })
  });
}

/** The invited donor accepts (it becomes a pending donation) or declines. */
async function respond(user, id, { accept }) {
  const donation = await donationOrFail(id);
  if (donation.donor.id !== user.id) {
    throw new NotFoundError('Donation not found.');
  }
  if (donation.status !== 'invited') {
    throw new ConflictError('This invitation was already answered or withdrawn.');
  }
  const request = await requestsDAL.findById(donation.request.id);
  const notices = [];
  if (accept) {
    ensureEligible(await donorOrFail(user.id), today(config.timeZone));
    if (request.status !== 'open') {
      throw new ConflictError('This request no longer needs donors.');
    }
    notices.push(
      notice(
        'response',
        `A donor accepted the invitation for your request at ${requestRules.where(request)}.`,
        `#/blood-requests/${request.id}`,
        request.requester.id
      )
    );
  }
  return donationsDAL.respond({
    donationId: id,
    donorId: user.id,
    status: accept ? 'pending' : 'declined',
    notices,
    adminNotice: notice(
      'response',
      `${user.full_name} ${accept ? 'accepted' : 'declined'} the invitation for the request at ${requestRules.where(request)}.`,
      '#/queue'
    )
  });
}

/** The donor takes back their own pending offer. */
async function withdraw(user, id) {
  const donation = await donationOrFail(id);
  if (donation.donor.id !== user.id) {
    throw new NotFoundError('Donation not found.');
  }
  if (!['pending', 'accepted'].includes(donation.status)) {
    throw new ConflictError('Only a pending or accepted offer can be withdrawn.');
  }
  return donationsDAL.withdraw({
    donationId: id,
    donorId: user.id,
    adminNotice: notice(
      'response',
      `${user.full_name} withdrew their offer to donate.`,
      '#/queue'
    )
  });
}

/** An admin cancels a donation that will not happen. */
async function cancel(admin, id, { note }, ip) {
  const donation = await donationOrFail(id);
  if (!['invited', 'pending', 'accepted'].includes(donation.status)) {
    throw new ConflictError(
      'Only an invited, pending or accepted donation can be cancelled.'
    );
  }
  return donationsDAL.cancel({
    donationId: id,
    note,
    reviewedBy: admin.id,
    notices: [
      notice(
        'donation',
        `${donation.status === 'invited' ? 'Your blood donation invitation was withdrawn' : donation.status === 'pending' ? 'Your blood donation offer was cancelled' : 'Your accepted blood donation was cancelled'} by LifeLink: ${note}`,
        '#/donations',
        donation.donor.id
      )
    ],
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: 'blood_donation.cancelled',
      entity: 'blood_donation',
      entityId: id,
      ip
    })
  });
}

/** Admin accepts the offer for collection. No donation date or blood units change. */
async function accept(admin, id, ip) {
  if (admin.role !== 'admin') {
    throw new ForbiddenError();
  }
  const donation = await donationOrFail(id);
  if (donation.status !== 'pending') {
    throw new ConflictError('Only a pending offer can be accepted.');
  }
  const donor = await donorOrFail(donation.donor.id);
  if (!donor.is_active || !donor.donor.is_available) {
    throw new ConflictError('This donor is inactive or unavailable.');
  }
  ensureEligible(donor, today(config.timeZone), 'This donor');
  if (donation.request) {
    const request = await requestsDAL.findById(donation.request.id);
    if (!request || request.status !== 'open') {
      throw new ConflictError('This request no longer needs donors.');
    }
  }
  return donationsDAL.accept({
    donationId: id,
    notices: [
      notice(
        'donation',
        'Your offer was accepted. LifeLink will arrange collection. Blood is counted only after it is physically received.',
        '#/donations',
        donor.id
      )
    ],
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: 'blood_donation.accepted',
      entity: 'blood_donation',
      entityId: id,
      ip
    })
  });
}

/** Records actual physical collection after screening; never just offer acceptance. */
async function confirm(admin, id, ip) {
  if (admin.role !== 'admin') {
    throw new ForbiddenError();
  }
  const donation = await donationOrFail(id);
  if (donation.status !== 'accepted') {
    throw new ConflictError(
      'Accept the offer first. Only an accepted donation can be confirmed as physically received.'
    );
  }
  const donor = await donorOrFail(donation.donor.id);
  const todayDate = today(config.timeZone);
  ensureEligible(donor, todayDate, 'This donor');
  const request = donation.request
    ? await requestsDAL.findById(donation.request.id)
    : null;
  const notices = [];
  let progress = null;
  let stockIn = null;
  if (request && request.status === 'open') {
    progress = requestRules.progressFor(request, 1);
    notices.push(requestRules.progressNotice(request, progress, 'donated'));
  } else {
    stockIn = {
      bloodTypeId: donor.donor.blood_type_id,
      units: 1,
      reason: 'donation',
      createdBy: admin.id,
      note: request ? `Request #${request.id} no longer needed it` : null
    };
  }
  const firstName = donor.full_name.split(' ')[0];
  notices.push(
    notice(
      'thanks',
      `Thank you, ${firstName}! Your donation was confirmed. You can donate again from ${addDays(todayDate, rules.DONATION_INTERVAL_DAYS)}.`,
      '#/donations',
      donor.id
    )
  );
  return donationsDAL.complete({
    donationId: id,
    reviewedBy: admin.id,
    donorId: donor.id,
    donationDate: todayDate,
    cutoffDate: rules.eligibilityCutoff(todayDate),
    progress,
    stockIn,
    notices,
    auditEntry: new AuditEntryDTO({
      userId: admin.id,
      action: 'blood_donation.confirmed',
      entity: 'blood_donation',
      entityId: id,
      ip
    })
  });
}

/** Donors see their own donations; admins see all. */
async function list(user, filter, page) {
  const { rows, total } = await donationsDAL.list(filter, page, {
    donorId: user.role === 'donor' ? user.id : null
  });
  return new PageDTO(rows, page, total);
}
module.exports = {
  eligibility,
  offer,
  invite,
  respond,
  withdraw,
  cancel,
  accept,
  confirm,
  list
};
