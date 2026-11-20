// Shared helpers for tests that need users and signed-in sessions.
// (Tests may reach any layer directly; the layer rules apply to the app code in src/.)
'use strict';

const request = require('supertest');
const db = require('../src/DAL/db');
const usersDAL = require('../src/DAL/users.dal');
const config = require('../src/config');
const { hashPassword } = require('../src/BLL/password');
const { today, addDays } = require('../src/BLL/dates');
const { RegisterDTO, ProfileUpdateDTO } = require('../src/DTO/user.dto');
const CSRF = {
  'X-Requested-With': 'LifeLink'
};

// Data tables, children before parents. Reference data (roles, blood types...) is kept.
const DATA_TABLES = [
  'sessions',
  'audit_logs',
  'notifications',
  'medicine_requests',
  'medicines',
  'medicine_calls',
  'blood_stock_movements',
  'blood_donations',
  'blood_requests',
  'donor_profiles',
  'users'
];

async function cleanDatabase() {
  for (const table of DATA_TABLES) await db.query(`DELETE FROM ${table}`);
  await db.query('UPDATE blood_stock SET units_available = 0');
}
let counter = 0;
const hashes = new Map(); // hashing is deliberately slow, so each test password is hashed once

/**
 * Creates a user directly through the DAL and returns { id, email, password, role }.
 * Options: role, password, bloodTypeId, isActive, isAvailable, email, full_name, city, latitude, longitude.
 */
async function createUser({
  role = 'donor',
  password = 'Password123',
  bloodTypeId = 8,
  isActive = true,
  isAvailable = true,
  ...rest
} = {}) {
  counter += 1;
  const email = rest.email || `${role}${counter}@test.lb`;
  if (!hashes.has(password)) hashes.set(password, await hashPassword(password));
  const user = await usersDAL.createAccount(
    new RegisterDTO({
      role,
      email,
      password,
      full_name: rest.full_name || `Test ${role} ${counter}`,
      blood_type_id: bloodTypeId,
      city: rest.city ?? 'Beirut',
      latitude: rest.latitude ?? null,
      longitude: rest.longitude ?? null
    }),
    hashes.get(password)
  );
  if (!isActive) await usersDAL.setActive(user.id, false);
  if (!isAvailable)
    await usersDAL.updateProfile(
      user.id,
      new ProfileUpdateDTO({
        is_available: false
      })
    );
  return {
    id: user.id,
    email,
    password,
    role
  };
}

/** The date n days ago in the app's time zone, e.g. daysAgo(10). */
const daysAgo = (n) => addDays(today(config.timeZone), -n);

async function setLastDonation(userId, date) {
  await db.query('UPDATE donor_profiles SET last_donation_date = ? WHERE user_id = ?', [
    date,
    userId
  ]);
}

async function notificationsOf(userId) {
  return db.query(
    'SELECT type, message, link FROM notifications WHERE user_id = ? ORDER BY id',
    [userId]
  );
}

/** Returns a supertest agent that keeps the session cookie, signed in as the given user. */
async function signIn(app, { email, password }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').set(CSRF).send({
    email,
    password
  });
  if (res.status !== 200)
    throw new Error(`sign-in failed in test: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
module.exports = {
  CSRF,
  cleanDatabase,
  createUser,
  signIn,
  daysAgo,
  setLastDonation,
  notificationsOf
};
