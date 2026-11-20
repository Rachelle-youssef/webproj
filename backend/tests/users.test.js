'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const { CSRF, cleanDatabase, createUser, signIn } = require('./helpers');
const app = createApp();
beforeEach(cleanDatabase);
afterAll(() => db.close());
describe('PATCH /users/me', () => {
  test('preserves zero coordinates and can explicitly clear the pair', async () => {
    const agent = await signIn(app, await createUser());
    const zero = await agent
      .patch('/api/v1/users/me')
      .set(CSRF)
      .send({ latitude: 0, longitude: 0 });
    expect(zero.status).toBe(200);
    expect(zero.body.data).toMatchObject({ latitude: 0, longitude: 0 });
    const cleared = await agent
      .patch('/api/v1/users/me')
      .set(CSRF)
      .send({ latitude: null, longitude: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ latitude: null, longitude: null });
  });
  test('rejects partial clearing and non-numeric profile coordinates', async () => {
    const agent = await signIn(app, await createUser());
    for (const body of [
      { latitude: null, longitude: 35.5 },
      { latitude: 33.89, longitude: null },
      { latitude: false, longitude: false },
      { latitude: '', longitude: '' },
      { latitude: [], longitude: [] }
    ]) {
      expect((await agent.patch('/api/v1/users/me').set(CSRF).send(body)).status).toBe(
        400
      );
    }
  });
  test.each([null, '', '   '])('clears the optional phone with %p', async (phone) => {
    const agent = await signIn(app, await createUser());
    await agent.patch('/api/v1/users/me').set(CSRF).send({ phone: '+961 3 123 456' });
    const response = await agent.patch('/api/v1/users/me').set(CSRF).send({ phone });
    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBeNull();
    expect((await agent.get('/api/v1/auth/me')).body.data.phone).toBeNull();
  });
  test('omitting the phone preserves it and non-text values are rejected', async () => {
    const agent = await signIn(app, await createUser());
    await agent.patch('/api/v1/users/me').set(CSRF).send({ phone: '+961 3 123 456' });
    const preserved = await agent
      .patch('/api/v1/users/me')
      .set(CSRF)
      .send({ city: 'Beirut' });
    expect(preserved.body.data.phone).toBe('+961 3 123 456');
    for (const phone of [false, 123456, {}, []]) {
      const response = await agent.patch('/api/v1/users/me').set(CSRF).send({ phone });
      expect(response.status).toBe(400);
    }
  });
  test("updates the signed-in user's own profile", async () => {
    const agent = await signIn(app, await createUser());
    const res = await agent.patch('/api/v1/users/me').set(CSRF).send({
      full_name: 'Karim Saad',
      city: 'Tripoli',
      latitude: 34.44,
      longitude: 35.84
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      full_name: 'Karim Saad',
      city: 'Tripoli',
      latitude: 34.44,
      longitude: 35.84
    });
  });
  test('a donor can switch availability off; other roles cannot', async () => {
    const donor = await signIn(
      app,
      await createUser({
        role: 'donor'
      })
    );
    const off = await donor.patch('/api/v1/users/me').set(CSRF).send({
      is_available: false
    });
    expect(off.body.data.donor.is_available).toBe(false);
    const patient = await signIn(
      app,
      await createUser({
        role: 'recipient'
      })
    );
    expect(
      (
        await patient.patch('/api/v1/users/me').set(CSRF).send({
          is_available: false
        })
      ).status
    ).toBe(400);
  });
  test('cannot change role, email or active status (mass assignment)', async () => {
    const agent = await signIn(
      app,
      await createUser({
        role: 'donor'
      })
    );
    const res = await agent.patch('/api/v1/users/me').set(CSRF).send({
      role: 'admin',
      email: 'boss@test.lb',
      is_active: false
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      role: 'donor',
      is_active: true
    });
    expect(res.body.data.email).not.toBe('boss@test.lb');
  });
  test('needs a signed-in user', async () => {
    expect(
      (
        await request(app).patch('/api/v1/users/me').set(CSRF).send({
          city: 'Tyre'
        })
      ).status
    ).toBe(401);
  });
});
describe('PATCH /users/me/password', () => {
  test('refuses a wrong current password', async () => {
    const agent = await signIn(app, await createUser());
    const res = await agent.patch('/api/v1/users/me/password').set(CSRF).send({
      current_password: 'nope',
      new_password: 'NewPassword456'
    });
    expect(res.status).toBe(400);
  });
  test('changes the password, keeps this device signed in, and signs out every other device', async () => {
    const user = await createUser();
    const laptop = await signIn(app, user);
    const phone = await signIn(app, user);
    const res = await laptop.patch('/api/v1/users/me/password').set(CSRF).send({
      current_password: user.password,
      new_password: 'NewPassword456'
    });
    expect(res.status).toBe(204);
    expect((await laptop.get('/api/v1/auth/me')).status).toBe(200);
    const stolen = await phone.get('/api/v1/auth/me');
    expect(stolen.status).toBe(401);
    expect(stolen.body.error.code).toBe('UNAUTHENTICATED'); // the revoked server record was deleted
    expect(
      (
        await request(app).post('/api/v1/auth/login').set(CSRF).send({
          email: user.email,
          password: user.password
        })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app).post('/api/v1/auth/login').set(CSRF).send({
          email: user.email,
          password: 'NewPassword456'
        })
      ).status
    ).toBe(200);
  });
});
describe('admin account management', () => {
  test('only admins can list users', async () => {
    const donor = await signIn(
      app,
      await createUser({
        role: 'donor'
      })
    );
    const res = await donor.get('/api/v1/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
  test('admins list users with filters, search, sorting and paging', async () => {
    const admin = await signIn(
      app,
      await createUser({
        role: 'admin'
      })
    );
    await createUser({
      role: 'donor',
      full_name: 'Sara Mansour'
    });
    await createUser({
      role: 'donor',
      full_name: 'Rami 100% Younes'
    });
    await createUser({
      role: 'hospital',
      full_name: 'Hôpital Nini'
    });
    const donors = await admin.get('/api/v1/users?role=donor&sort=full_name&limit=1');
    expect(donors.status).toBe(200);
    expect(donors.body.meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      pages: 2
    });
    expect(donors.body.data[0].full_name).toBe('Rami 100% Younes');
    const search = await admin.get('/api/v1/users?q=100%25');
    expect(search.body.data.map((u) => u.full_name)).toEqual(['Rami 100% Younes']); // % is searched literally

    expect((await admin.get('/api/v1/users?sort=password_hash')).status).toBe(400);
    expect((await admin.get('/api/v1/users?role=superuser')).status).toBe(400);
  });
  test('deactivating an account ends its session and blocks sign-in; reactivating restores it', async () => {
    const adminUser = await createUser({
      role: 'admin'
    });
    const admin = await signIn(app, adminUser);
    const donorUser = await createUser({
      role: 'donor'
    });
    const donor = await signIn(app, donorUser);
    const off = await admin.patch(`/api/v1/users/${donorUser.id}/status`).set(CSRF).send({
      is_active: false
    });
    expect(off.status).toBe(200);
    expect(off.body.data.is_active).toBe(false);
    expect((await donor.get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/login').set(CSRF).send(donorUser)).status
    ).toBe(403);
    await admin.patch(`/api/v1/users/${donorUser.id}/status`).set(CSRF).send({
      is_active: true
    });
    expect(
      (await request(app).post('/api/v1/auth/login').set(CSRF).send(donorUser)).status
    ).toBe(200);
    const audit = await db.query(
      'SELECT action FROM audit_logs WHERE user_id = ? AND entity_id = ? ORDER BY id',
      [adminUser.id, donorUser.id]
    );
    expect(audit.map((a) => a.action)).toEqual(['user.deactivated', 'user.activated']);
  });
  test('an admin cannot deactivate their own account', async () => {
    const adminUser = await createUser({
      role: 'admin'
    });
    const admin = await signIn(app, adminUser);
    expect(
      (
        await admin.patch(`/api/v1/users/${adminUser.id}/status`).set(CSRF).send({
          is_active: false
        })
      ).status
    ).toBe(403);
  });
  test('a donor cannot deactivate anyone', async () => {
    const donor = await signIn(
      app,
      await createUser({
        role: 'donor'
      })
    );
    const other = await createUser({
      role: 'donor'
    });
    expect(
      (
        await donor.patch(`/api/v1/users/${other.id}/status`).set(CSRF).send({
          is_active: false
        })
      ).status
    ).toBe(403);
  });
  test('GET /users/:id returns 404 for an unknown user and 400 for a bad id', async () => {
    const admin = await signIn(
      app,
      await createUser({
        role: 'admin'
      })
    );
    expect((await admin.get('/api/v1/users/999999')).status).toBe(404);
    expect((await admin.get('/api/v1/users/abc')).status).toBe(400);
  });
});
