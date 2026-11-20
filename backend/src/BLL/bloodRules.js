// BLL: the blood donation rules in one place.
'use strict';

const { addDays, daysBetween } = require('./dates');

// Minimum time between two whole-blood donations: 8 weeks (56 days),
// the interval used by the American Red Cross.
const DONATION_INTERVAL_DAYS = 56;

// A recipient or hospital may have at most this many requests waiting or open at once.
const MAX_ACTIVE_REQUESTS = 5;

// How many matching donors an admin sees at once, and how many an SOS alert can reach.
const MATCH_LIMIT = 20;
const SOS_ALERT_LIMIT = 1000;

/** Can someone who last gave blood on lastDonationDate (or never) give again on todayDate? */
function eligibility(lastDonationDate, todayDate) {
  if (!lastDonationDate) {
    return {
      eligible: true,
      next_eligible_date: todayDate,
      days_remaining: 0
    };
  }
  const next = addDays(lastDonationDate, DONATION_INTERVAL_DAYS);
  const remaining = Math.max(0, daysBetween(todayDate, next));
  return {
    eligible: remaining === 0,
    next_eligible_date: next,
    days_remaining: remaining
  };
}

/** Donors whose last donation is on or before this date are eligible today. */
function eligibilityCutoff(todayDate) {
  return addDays(todayDate, -DONATION_INTERVAL_DAYS);
}
module.exports = {
  DONATION_INTERVAL_DAYS,
  MAX_ACTIVE_REQUESTS,
  MATCH_LIMIT,
  SOS_ALERT_LIMIT,
  eligibility,
  eligibilityCutoff
};
