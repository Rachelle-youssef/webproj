'use strict';
const request = require('supertest');
const { createHash, createHmac } = require('node:crypto');
const { createApp } = require('../src/app');
const config = require('../src/config');
const db = require('../src/DAL/db');
const usersDAL = require('../src/DAL/users.dal');
const sessionsBLL = require('../src/BLL/sessions.bll');
const { MySqlSessionStore } = require('../src/PL/session');
const { CSRF, cleanDatabase, createUser } = require('./helpers');
const app = createApp();
beforeEach(cleanDatabase);
afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());

async function login(user, cookie) {
  const req = request(app).post('/api/v1/auth/login').set(CSRF);
  if (cookie) req.set('Cookie', cookie);
  const res = await req.send({ email: user.email, password: user.password });
  expect(res.status).toBe(200);
  const value = res.headers['set-cookie'].find((c) => c.startsWith('ll_session='));
  const cookiePair = value.split(';')[0];
  const signed = decodeURIComponent(cookiePair.substring('ll_session='.length));
  const id = signed.substring(2, signed.lastIndexOf('.'));
  const expectedSignature = createHmac('sha256', config.session.secret)
    .update(id)
    .digest('base64')
    .replace(/=+$/, '');
  expect(signed).toBe('s:' + id + '.' + expectedSignature);
  return {
    cookie: cookiePair,
    id,
    hash: createHash('sha256').update(id).digest('hex'),
    signed
  };
}
const me = (session, target = app) =>
  request(target).get('/api/v1/auth/me').set('Cookie', session.cookie);

test('login stores a hashed session ID in MySQL and no user details in the cookie', async () => {
  const user = await createUser();
  const session = await login(user);
  expect(session.signed).toMatch(/^s:[^.]+\.[^.]+$/);
  const [row] = await db.query('SELECT * FROM sessions WHERE id_hash = ?', [
    session.hash
  ]);
  expect(row.user_id).toBe(user.id);
  const data = JSON.parse(row.data);
  expect(data).toMatchObject({ userId: user.id, sessionVersion: 0 });
  expect(Object.keys(data).sort()).toEqual([
    'cookie',
    'expiresAt',
    'sessionVersion',
    'userId'
  ]);
  expect(row.data).not.toMatch(/password|email|role|argon2/);
  expect(row.id_hash).not.toContain(session.id);
  expect((await me(session)).body.data.id).toBe(user.id);
});

test('a second Express application instance reads the same persistent session', async () => {
  const user = await createUser();
  const session = await login(user);
  expect((await me(session, createApp())).body.data.id).toBe(user.id);
});

test('logging in again regenerates the ID and permanently invalidates the previous ID', async () => {
  const user = await createUser();
  const first = await login(user);
  const next = await login(user, first.cookie);
  expect(next.id).not.toBe(first.id);
  expect((await me(first)).status).toBe(401);
  expect((await me(next)).status).toBe(200);
  expect(
    await db.query('SELECT id_hash FROM sessions WHERE user_id = ?', [user.id])
  ).toHaveLength(1);
});

test('logging into another account in the same browser replaces its previous session', async () => {
  const first = await login(await createUser());
  const hospital = await createUser({ role: 'hospital' });
  const next = await login(hospital, first.cookie);
  expect((await me(next)).body.data).toMatchObject({ id: hospital.id, role: 'hospital' });
  expect((await me(first)).status).toBe(401);
});

test('logout deletes the server row; replaying a copied cookie returns 401', async () => {
  const session = await login(await createUser());
  const out = await request(app)
    .post('/api/v1/auth/logout')
    .set(CSRF)
    .set('Cookie', session.cookie);
  expect(out.status).toBe(204);
  expect(out.headers['set-cookie'].join()).toMatch(/ll_session=;/);
  expect(
    await db.query('SELECT id_hash FROM sessions WHERE id_hash = ?', [session.hash])
  ).toHaveLength(0);
  expect((await me(session)).status).toBe(401);
});

test('two browser sessions remain independent and logout affects only one', async () => {
  const user = await createUser();
  const laptop = await login(user);
  const phone = await login(user);
  expect(laptop.id).not.toBe(phone.id);
  await request(app).post('/api/v1/auth/logout').set(CSRF).set('Cookie', laptop.cookie);
  expect((await me(laptop)).status).toBe(401);
  expect((await me(phone)).status).toBe(200);
});

test.each([
  'a-made-up-id',
  's:made-up-id.invalid-signature',
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.'
])('refuses forged or old JWT cookie %s', async (value) => {
  const res = await me({ cookie: `ll_session=${encodeURIComponent(value)}` });
  expect(res.status).toBe(401);
  expect(await db.query('SELECT id_hash FROM sessions')).toHaveLength(0);
});

test('a genuine ID with a changed signature is rejected', async () => {
  const session = await login(await createUser());
  const last = session.signed.slice(-1);
  const forged = session.signed.slice(0, -1) + (last === 'a' ? 'b' : 'a');
  expect((await me({ cookie: `ll_session=${encodeURIComponent(forged)}` })).status).toBe(
    401
  );
});

test('expiry is enforced by MySQL even when the browser keeps sending its cookie', async () => {
  const session = await login(await createUser());
  await db.query(
    'UPDATE sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id_hash = ?',
    [session.hash]
  );
  expect((await me(session)).status).toBe(401);
  await login(await createUser());
  expect(
    await db.query('SELECT id_hash FROM sessions WHERE id_hash = ?', [session.hash])
  ).toHaveLength(0);
});

test('read-only requests do not extend expiry', async () => {
  const session = await login(await createUser());
  const [before] = await db.query('SELECT expires_at FROM sessions WHERE id_hash = ?', [
    session.hash
  ]);
  const res = await me(session);
  expect(res.status).toBe(200);
  expect(res.headers['set-cookie']).toBeUndefined();
  const [after] = await db.query('SELECT expires_at FROM sessions WHERE id_hash = ?', [
    session.hash
  ]);
  expect(after.expires_at).toEqual(before.expires_at);
});

test('anonymous requests, invalid login and repeated anonymous logout create no session rows', async () => {
  await request(app).get('/api/v1/auth/me').expect(401);
  await request(app).get('/api/v1/health');
  await request(app)
    .post('/api/v1/auth/login')
    .set(CSRF)
    .send({ email: 'missing@test.lb', password: 'WrongPass123' })
    .expect(401);
  await request(app).post('/api/v1/auth/logout').set(CSRF).expect(204);
  await request(app).post('/api/v1/auth/logout').set(CSRF).expect(204);
  expect(await db.query('SELECT id_hash FROM sessions')).toHaveLength(0);
});

test('password change deletes all old rows and keeps only a new session for this browser', async () => {
  const user = await createUser();
  const laptop = await login(user);
  const phone = await login(user);
  const changed = await request(app)
    .patch('/api/v1/users/me/password')
    .set(CSRF)
    .set('Cookie', laptop.cookie)
    .send({ current_password: user.password, new_password: 'NewPassword456' });
  expect(changed.status).toBe(204);
  const renewed = { cookie: changed.headers['set-cookie'][0].split(';')[0] };
  expect((await me(laptop)).status).toBe(401);
  expect((await me(phone)).status).toBe(401);
  expect((await me(renewed)).status).toBe(200);
  expect(
    await db.query('SELECT user_id FROM sessions WHERE user_id = ?', [user.id])
  ).toHaveLength(1);
});

test('deactivation revokes all sessions; reactivation cannot revive old cookies', async () => {
  const user = await createUser();
  const laptop = await login(user);
  const phone = await login(user);
  await usersDAL.setActive(user.id, false);
  expect(
    await db.query('SELECT user_id FROM sessions WHERE user_id = ?', [user.id])
  ).toHaveLength(0);
  await usersDAL.setActive(user.id, true);
  expect((await me(laptop)).status).toBe(401);
  expect((await me(phone)).status).toBe(401);
  expect((await me(await login(user))).status).toBe(200);
});

test('a late save with a revoked version cannot recreate an authenticated row', async () => {
  const user = await createUser();
  const session = await login(user);
  const stale = await sessionsBLL.find(session.id);
  await usersDAL.setActive(user.id, false);
  await usersDAL.setActive(user.id, true);
  await expect(sessionsBLL.save(session.id, stale)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED'
  });
  expect((await me(session)).status).toBe(401);
});

test('a delayed touch after logout cannot recreate the deleted row', async () => {
  const session = await login(await createUser());
  const stale = await sessionsBLL.find(session.id);
  await request(app)
    .post('/api/v1/auth/logout')
    .set(CSRF)
    .set('Cookie', session.cookie)
    .expect(204);
  await new Promise((resolve, reject) =>
    new MySqlSessionStore().touch(session.id, stale, (e) => (e ? reject(e) : resolve()))
  );
  expect((await me(session)).status).toBe(401);
});

test.each(['find', 'save', 'remove'])(
  'store %s failure uses the standard error response and exposes no data',
  async (method) => {
    const user = await createUser();
    const session = await login(user);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(sessionsBLL, method)
      .mockRejectedValue(new Error('private-sql-and-secret'));
    let res;
    if (method === 'find') res = await me(session);
    if (method === 'save')
      res = await request(app).post('/api/v1/auth/login').set(CSRF).send(user);
    if (method === 'remove')
      res = await request(app)
        .post('/api/v1/auth/logout')
        .set(CSRF)
        .set('Cookie', session.cookie);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/private-sql|secret|sessionId/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-sql-and-secret/);
    if (method === 'save') expect(res.headers['set-cookie']).toBeUndefined();
  }
);
