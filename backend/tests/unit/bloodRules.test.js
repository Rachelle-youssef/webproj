// The blood donation rules and date arithmetic, tested without a database.
'use strict';

const { today, addDays, daysBetween } = require('../../src/BLL/dates');
const rules = require('../../src/BLL/bloodRules');
describe('dates', () => {
  test('today is a YYYY-MM-DD date in the given time zone', () => {
    expect(today('Asia/Beirut')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('add days across months, years and leap days', () => {
    expect(addDays('2026-10-23', 56)).toBe('2026-12-18');
    expect(addDays('2026-12-20', 56)).toBe('2027-02-14');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-23', -56)).toBe('2026-08-28');
  });
  test('count whole days between two dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-23')).toBe(22);
    expect(daysBetween('2026-10-23', '2026-10-01')).toBe(-22);
  });
});
describe('donation eligibility', () => {
  test('someone who never donated is eligible today', () => {
    expect(rules.eligibility(null, '2026-10-23')).toEqual({
      eligible: true,
      next_eligible_date: '2026-10-23',
      days_remaining: 0
    });
  });
  test('exactly 56 days later is the first eligible day', () => {
    expect(rules.eligibility('2026-08-28', '2026-10-22')).toEqual({
      eligible: false,
      next_eligible_date: '2026-10-23',
      days_remaining: 1
    });
    expect(rules.eligibility('2026-08-28', '2026-10-23')).toEqual({
      eligible: true,
      next_eligible_date: '2026-10-23',
      days_remaining: 0
    });
  });
  test('the matching cutoff agrees with the eligibility rule', () => {
    const cutoff = rules.eligibilityCutoff('2026-10-23');
    expect(cutoff).toBe('2026-08-28');
    expect(rules.eligibility(cutoff, '2026-10-23').eligible).toBe(true);
    expect(rules.eligibility(addDays(cutoff, 1), '2026-10-23').eligible).toBe(false);
  });
});
