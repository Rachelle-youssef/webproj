// BLL: calendar dates for business rules, in the platform's time zone (Asia/Beirut by default),
// so "today" means today in Lebanon, not in UTC. Dates are 'YYYY-MM-DD' text.
'use strict';

/** Today's date in the given time zone, e.g. '2026-10-23'. */
function today(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/** addDays('2026-10-23', 56) -> '2026-12-18' (negative days go back in time). */
function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from one date to another: daysBetween('2026-10-01', '2026-10-23') -> 22. */
function daysBetween(from, to) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
  );
}
module.exports = {
  today,
  addDays,
  daysBetween
};
