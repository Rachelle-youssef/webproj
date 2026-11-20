'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const { CSRF, cleanDatabase, createUser, signIn } = require('./helpers');
const app = createApp();
beforeEach(cleanDatabase);
afterAll(() => db.close());
const donorForm = {
  full_name: 'Maya Nasr',
  email: 'Maya@Test.lb',
  password: 'Password123',
  role: 'donor',
  city: 'Beirut',
  phone: '+961 3 123 456',
  latitude: 33.89,
  longitude: 35.5,
  blood_type_id: 8
};
const register = (body) =>
  request(app).post('/api/v1/auth/register').set(CSRF).send(body);
const sessionCookie = (res) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith('ll_session='));
describe('POST /auth/register', () => {
  test('creates a donor, signs them in, and never returns the password hash', async () => {
    const res = await register(donorForm);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      full_name: 'Maya Nasr',
      email: 'maya@test.lb',
      role: 'donor',
      city: 'Beirut',
      latitude: 33.89,
      is_active: true,
      donor: {
        blood_type_id: 8,
        blood_type: 'O-',
        last_donation_date: null,
        is_available: true
      }
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api/);
  });
  test('a hospital needs no blood type and has no donor profile', async () => {
    const res = await register({
      ...donorForm,
      role: 'hospital',
      blood_type_id: undefined,
      full_name: 'Rafik Hariri Hospital'
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      role: 'hospital',
      donor: null
    });
  });
  test('refuses a second account with the same email, whatever the letter case', async () => {
    await register(donorForm);
    const res = await register({
      ...donorForm,
      email: 'MAYA@TEST.LB'
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
  test('lists every invalid field', async () => {
    const res = await register({
      full_name: 'M',
      email: 'not-an-email',
      password: 'short',
      role: 'admin',
      city: '',
      latitude: 95,
      longitude: 35
    });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'full_name',
        'email',
        'password',
        'role',
        'city',
        'latitude'
      ])
    );
  });
  test('a donor must give a blood type', async () => {
    const res = await register({
      ...donorForm,
      blood_type_id: undefined
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'blood_type_id',
      message: 'is required for donors (1 to 8)'
    });
  });
  test('latitude and longitude must come together', async () => {
    const res = await register({
      ...donorForm,
      longitude: undefined
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'longitude',
      message: 'send latitude and longitude together'
    });
  });
  test('ignores fields an attacker adds (mass assignment)', async () => {
    const res = await register({
      ...donorForm,
      role_id: 4,
      is_active: false,
      password_hash: 'x',
      session_version: 99
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      role: 'donor',
      is_active: true
    });
  });
  test('cannot create an admin', async () => {
    const res = await register({
      ...donorForm,
      role: 'admin'
    });
    expect(res.status).toBe(400);
  });
  test('is written to the audit log', async () => {
    const res = await register(donorForm);
    const rows = await db.query(
      "SELECT action FROM audit_logs WHERE user_id = ? AND action = 'auth.registered'",
      [res.body.data.id]
    );
    expect(rows).toHaveLength(1);
  });
});
describe('POST /auth/login', () => {
  test('signs in with the right password', async () => {
    const user = await createUser({
      role: 'hospital'
    });
    const res = await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: user.email.toUpperCase(),
      password: user.password
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: user.id,
      role: 'hospital'
    });
    expect(sessionCookie(res)).toBeDefined();
  });
  test('gives the same answer for a wrong password and an unknown email', async () => {
    const user = await createUser();
    const wrong = await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: user.email,
      password: 'WrongPass1'
    });
    const unknown = await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: 'nobody@test.lb',
      password: 'WrongPass1'
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(sessionCookie(wrong)).toBeUndefined();
  });
  test('records failed attempts in the audit log', async () => {
    const user = await createUser();
    await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: user.email,
      password: 'WrongPass1'
    });
    const rows = await db.query(
      "SELECT user_id FROM audit_logs WHERE action = 'auth.login_failed'"
    );
    expect(rows).toEqual([
      {
        user_id: user.id
      }
    ]);
  });
  test('a deactivated account is told so only when the password is right', async () => {
    const user = await createUser({
      isActive: false
    });
    const right = await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: user.email,
      password: user.password
    });
    const wrong = await request(app).post('/api/v1/auth/login').set(CSRF).send({
      email: user.email,
      password: 'WrongPass1'
    });
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('ACCOUNT_DISABLED');
    expect(wrong.status).toBe(401);
  });
});
describe('sessions', () => {
  test('GET /auth/me returns the signed-in user', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: user.id,
      email: user.email,
      role: 'donor'
    });
  });
  test('without a cookie the answer is 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
  test('POST /auth/logout ends the session', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const out = await agent.post('/api/v1/auth/logout').set(CSRF);
    expect(out.status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});
