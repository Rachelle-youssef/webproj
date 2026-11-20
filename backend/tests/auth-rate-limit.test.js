// Password guessing is slowed down: after AUTH_RATE_LIMIT_MAX attempts in 15 minutes
// from one address, sign-in answers 429 even if the password is right.
'use strict';

process.env.AUTH_RATE_LIMIT_MAX = '3'; // must be set before the app is loaded

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const { CSRF, cleanDatabase, createUser } = require('./helpers');
const app = createApp();
afterAll(() => db.close());
test('the 4th sign-in attempt within 15 minutes is refused', async () => {
  await cleanDatabase();
  const user = await createUser();
  for (let i = 0; i < 3; i += 1) {
    await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: user.email,
      password: 'WrongPass1'
    });
  }
  const res = await request(app).post('/api/v1/auth/login').set(CSRF).send({
    email: user.email,
    password: user.password
  });
  expect(res.status).toBe(429);
  expect(res.body.error.code).toBe('RATE_LIMITED');
});
