'use strict';

const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const { CSRF, cleanDatabase, createUser, signIn, notificationsOf } = require('./helpers');
const { today, addDays } = require('../src/BLL/dates');
const config = require('../src/config');
afterAll(() => db.close());
test('patients and hospitals request available medicine without reserving stock', async () => {
  await cleanDatabase();
  const app = createApp();
  const donorUser = await createUser();
  const donor = await signIn(app, donorUser);
  const patient = await signIn(
    app,
    await createUser({
      role: 'recipient'
    })
  );
  const hospital = await signIn(
    app,
    await createUser({
      role: 'hospital'
    })
  );
  const adminUser = await createUser({
    role: 'admin'
  });
  const admin = await signIn(app, adminUser);
  const expiry = today(config.timeZone);
  async function batch(name, status, date, quantity) {
    const result = await db.query(
      'INSERT INTO medicines (donor_id, category_id, name, status, expiry_date, quantity_donated, quantity_available) VALUES (?, 1, ?, ?, ?, 3, ?)',
      [donorUser.id, name, status, date, quantity]
    );
    return result.insertId;
  }
  const date = addDays(expiry, 30);
  const available = await batch('Available', 'approved', date, 3);
  const expired = await batch('Expired', 'approved', expiry, 3);
  const pending = await batch('Pending', 'pending', date, 0);
  const empty = await batch('Empty', 'approved', date, 0);
  const catalog = '/api/v1/medicines/available';
  const path = '/api/v1/medicine-requests';
  const listing = await patient.get(catalog);
  expect(listing.status).toBe(200);
  expect(listing.body.data.map((row) => row.id)).toEqual([available]);
  expect(listing.body.data[0]).not.toHaveProperty('donor_id');
  const submit = (agent, id, quantity) =>
    agent.post(path).set(CSRF).send({
      medicine_id: id,
      quantity
    });
  for (const id of [expired, pending, empty])
    expect((await submit(patient, id, 1)).status).toBe(409);
  expect((await submit(patient, available, 4)).status).toBe(409);
  expect((await submit(donor, available, 1)).status).toBe(403);
  const first = await submit(patient, available, 2);
  const second = await submit(hospital, available, 2);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(first.body.data).toMatchObject({
    medicine_id: available,
    quantity: 2,
    status: 'pending'
  });
  expect((await patient.get(path)).body.data.map((row) => row.id)).toEqual([
    first.body.data.id
  ]);
  expect((await hospital.get(path)).body.data.map((row) => row.id)).toEqual([
    second.body.data.id
  ]);
  expect((await admin.get(path + '?status=pending')).body.meta.total).toBe(2);
  expect((await patient.get(catalog)).body.data[0].quantity_available).toBe(3);
  expect(await notificationsOf(adminUser.id)).toHaveLength(2);
  const dispense = (agent, id) => agent.patch(path + '/' + id + '/dispense').set(CSRF);
  expect((await dispense(patient, first.body.data.id)).status).toBe(403);
  const attempts = await Promise.all([
    dispense(admin, first.body.data.id),
    dispense(admin, first.body.data.id),
    dispense(admin, second.body.data.id)
  ]);
  expect(attempts.map((response) => response.status).sort()).toEqual([200, 409, 409]);
  const winner = attempts.find((response) => response.status === 200).body.data;
  expect(winner).toMatchObject({
    status: 'approved',
    quantity_available: 1
  });
  expect((await dispense(admin, winner.id)).status).toBe(409);
  expect((await patient.get(catalog)).body.data[0].quantity_available).toBe(1);
  expect((await admin.get(path + '?status=pending')).body.meta.total).toBe(1);
  expect(await notificationsOf(winner.requester_id)).toHaveLength(1);
  const last = await submit(patient, available, 1);
  expect(last.status).toBe(201);
  const drained = await dispense(admin, last.body.data.id);
  expect(drained.status).toBe(200);
  expect(drained.body.data.quantity_available).toBe(0);
  expect((await admin.get('/api/v1/medicines/' + available)).body.data.status).toBe(
    'dispensed'
  );
  expect((await patient.get(catalog)).body.data).toEqual([]);
  const audit = await admin.get(
    '/api/v1/admin/audit-logs?action=medicine_request.dispensed'
  );
  expect(audit.body.meta.total).toBe(2);
  const expiring = await batch('Expiring soon', 'approved', date, 3);
  const waiting = await submit(patient, expiring, 2);
  expect(waiting.status).toBe(201);
  await db.query('UPDATE medicines SET expiry_date = ? WHERE id = ?', [expiry, expiring]);
  expect((await dispense(admin, waiting.body.data.id)).status).toBe(409);
  expect(
    (await admin.get('/api/v1/medicines/' + expiring)).body.data.quantity_available
  ).toBe(3);
});
