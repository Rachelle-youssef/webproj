'use strict';

const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const { CSRF, cleanDatabase, createUser, signIn, notificationsOf } = require('./helpers');
const { today, addDays } = require('../src/BLL/dates');
const config = require('../src/config');
afterAll(() => db.close());
test('medicine review controls stock, visibility and notifications', async () => {
  await cleanDatabase();
  const app = createApp();
  const donorUser = await createUser();
  const donor = await signIn(app, donorUser);
  const other = await signIn(app, await createUser());
  const admin = await signIn(
    app,
    await createUser({
      role: 'admin'
    })
  );
  const categories = await donor.get('/api/v1/medicines/categories');
  expect(categories.status).toBe(200);
  const input = {
    name: 'Test medicine',
    category_id: categories.body.data[0].id,
    quantity_donated: 3,
    expiry_date: addDays(today(config.timeZone), 30)
  };
  const submit = (data) => donor.post('/api/v1/medicines').set(CSRF).send(data);
  expect(
    (
      await submit({
        ...input,
        expiry_date: today(config.timeZone)
      })
    ).status
  ).toBe(400);
  const created = await submit(input);
  expect(created.status).toBe(201);
  expect(created.body.data).toMatchObject({
    status: 'pending',
    quantity_available: 0
  });
  expect((await other.get('/api/v1/medicines')).body.data).toEqual([]);
  const path = '/api/v1/medicines/' + created.body.data.id + '/review';
  expect(
    (
      await donor.patch(path).set(CSRF).send({
        decision: 'approve'
      })
    ).status
  ).toBe(403);
  const batchPath = '/api/v1/medicines/' + created.body.data.id;
  expect((await admin.get(batchPath + '/qr')).status).toBe(409);
  expect((await donor.get(batchPath + '/qr')).status).toBe(403);
  const approve = () =>
    admin.patch(path).set(CSRF).send({
      decision: 'approve'
    });
  const results = await Promise.all([approve(), approve()]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(results.find((r) => r.status === 200).body.data).toMatchObject({
    status: 'approved',
    quantity_available: 3
  });
  expect(await notificationsOf(donorUser.id)).toHaveLength(1);
  const label = await admin.get(batchPath + '/qr');
  expect(label.status).toBe(200);
  expect(label.headers['content-type']).toMatch(/^image\/png/);
  expect(label.headers['cache-control']).toBe('private, no-store');
  expect(label.body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect((await admin.get(batchPath)).body.data).toMatchObject({
    id: created.body.data.id,
    status: 'approved',
    expiry_date: input.expiry_date
  });
  const next = await submit(input);
  const reject = (note) =>
    admin
      .patch('/api/v1/medicines/' + next.body.data.id + '/review')
      .set(CSRF)
      .send({
        decision: 'reject',
        note
      });
  expect((await reject()).status).toBe(400);
  const rejected = await reject('Test rejection');
  expect(rejected.status).toBe(200);
  expect(rejected.body.data).toMatchObject({
    status: 'rejected',
    quantity_available: 0
  });
  expect((await admin.get('/api/v1/medicines/' + next.body.data.id + '/qr')).status).toBe(
    409
  );
});
