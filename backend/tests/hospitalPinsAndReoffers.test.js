'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const audit = require('../src/DAL/audit.dal');
const {
  CSRF,
  cleanDatabase,
  createUser,
  signIn,
  setLastDonation,
  daysAgo
} = require('./helpers');
const app = createApp();
const pin = { latitude: 33.89, longitude: 35.51 };
const tripoli = { latitude: 34.43, longitude: 35.84 };
const input = { blood_type_id: 8, units_needed: 3, hospital_name: 'QA Hospital' };
let adminUser, admin, donor, donorAgent, patient, patientAgent;
beforeEach(async () => {
  await cleanDatabase();
  adminUser = await createUser({ role: 'admin' });
  admin = await signIn(app, adminUser);
  donor = await createUser();
  donorAgent = await signIn(app, donor);
  patient = await createUser({ role: 'recipient', ...pin });
  patientAgent = await signIn(app, patient);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());
async function openRequest() {
  const res = await admin
    .post('/api/v1/calls/blood')
    .set(CSRF)
    .send({ ...input, ...pin });
  expect(res.status).toBe(201);
  return res.body.data.id;
}
async function offer(id) {
  return donorAgent.post('/api/v1/blood-donations').set(CSRF).send({ request_id: id });
}
async function withdrawn(id, accepted = false) {
  const res = await offer(id);
  expect(res.status).toBe(201);
  const donationId = res.body.data.id;
  if (accepted)
    await admin
      .patch('/api/v1/blood-donations/' + donationId + '/accept')
      .set(CSRF)
      .expect(200);
  await donorAgent
    .patch('/api/v1/blood-donations/' + donationId + '/withdraw')
    .set(CSRF)
    .expect(200);
  return donationId;
}
const registerHospital = (coordinates = {}) =>
  request(app)
    .post('/api/v1/auth/register')
    .set(CSRF)
    .send({
      full_name: 'Registered Hospital',
      email: 'hospital@qa.test',
      password: 'Password123',
      role: 'hospital',
      city: 'Beirut',
      ...coordinates
    });

test('hospital sign-up requires a selected hospital pin', async () => {
  const res = await registerHospital();
  expect(res.status).toBe(400);
  expect(res.body.error.message).toMatch(/hospital location/);
});
test('hospital sign-up rejects an overseas pin', async () => {
  expect((await registerHospital({ latitude: 51.5, longitude: -0.12 })).status).toBe(400);
});
test('hospital sign-up saves its pin and creates no donor profile', async () => {
  const res = await registerHospital(pin);
  expect(res.status).toBe(201);
  expect(res.body.data).toMatchObject({ ...pin, role: 'hospital', donor: null });
});
test('new hospital requests reuse its saved location without moving older requests', async () => {
  const who = await createUser({ role: 'hospital', ...pin });
  const agent = await signIn(app, who);
  const first = await agent.post('/api/v1/blood-requests').set(CSRF).send(input);
  expect(first.status).toBe(201);
  expect(first.body.data).toMatchObject({ ...pin, has_hospital_pin: true });
  await agent.patch('/api/v1/users/me').set(CSRF).send(tripoli).expect(200);
  const next = await agent.post('/api/v1/blood-requests').set(CSRF).send(input);
  expect(next.body.data).toMatchObject(tripoli);
  expect(
    (await agent.get('/api/v1/blood-requests/' + first.body.data.id)).body.data
  ).toMatchObject(pin);
});
test.each([
  { latitude: null, longitude: null },
  { latitude: 51.5, longitude: -0.12 }
])('saved hospital pin cannot be cleared or moved overseas %p', async (changes) => {
  const who = await createUser({ role: 'hospital', ...pin });
  const agent = await signIn(app, who);
  await agent.patch('/api/v1/users/me').set(CSRF).send(changes).expect(400);
  expect((await agent.get('/api/v1/auth/me')).body.data).toMatchObject(pin);
});
test('a patient home location and city are never inherited as the treating hospital', async () => {
  const res = await patientAgent.post('/api/v1/blood-requests').set(CSRF).send(input);
  expect(res.status).toBe(201);
  expect(res.body.data).toMatchObject({
    latitude: null,
    longitude: null,
    city: null,
    has_hospital_pin: false
  });
});
test('an explicit patient hospital pin appears after review without revealing patient identity', async () => {
  const res = await patientAgent
    .post('/api/v1/blood-requests')
    .set(CSRF)
    .send({ ...input, ...pin });
  expect(res.status).toBe(201);
  const id = res.body.data.id;
  expect(res.body.data.has_hospital_pin).toBe(true);
  expect((await donorAgent.get('/api/v1/feed/map')).body.data).toHaveLength(0);
  await admin
    .patch('/api/v1/blood-requests/' + id + '/review')
    .set(CSRF)
    .send({ decision: 'approve' })
    .expect(200);
  const rows = (await donorAgent.get('/api/v1/feed/map')).body.data;
  expect(rows).toEqual([expect.objectContaining({ id, ...pin })]);
  expect(rows[0]).not.toHaveProperty('requester_id');
  expect(rows[0]).not.toHaveProperty('requester');
});
test('legacy patient coordinates remain private until an owned hospital pin is explicitly saved', async () => {
  const res = await patientAgent.post('/api/v1/blood-requests').set(CSRF).send(input);
  const id = res.body.data.id;
  await db.query(
    "UPDATE blood_requests SET latitude=?,longitude=?,status='open' WHERE id=?",
    [pin.latitude, pin.longitude, id]
  );
  expect((await donorAgent.get('/api/v1/feed/map')).body.data).toHaveLength(0);
  const other = await signIn(app, await createUser({ role: 'recipient' }));
  await other
    .patch('/api/v1/blood-requests/' + id + '/location')
    .set(CSRF)
    .send(pin)
    .expect(404);
  await patientAgent
    .patch('/api/v1/blood-requests/' + id + '/location')
    .set(CSRF)
    .send(tripoli)
    .expect(200);
  expect((await donorAgent.get('/api/v1/feed/map')).body.data).toEqual([
    expect.objectContaining({ id, ...tripoli })
  ]);
});
test('admin can confirm a legacy patient hospital pin', async () => {
  const res = await patientAgent.post('/api/v1/blood-requests').set(CSRF).send(input);
  const id = res.body.data.id;
  await admin
    .patch('/api/v1/blood-requests/' + id + '/location')
    .set(CSRF)
    .send(pin)
    .expect(200);
  const [row] = await db.query('SELECT has_hospital_pin FROM blood_requests WHERE id=?', [
    id
  ]);
  expect(row.has_hospital_pin).toBe(true);
});
test('a cancelled invitation is described as an invitation, not a planned donation', async () => {
  const id = await openRequest();
  const invite = await admin
    .post('/api/v1/blood-requests/' + id + '/invitations')
    .set(CSRF)
    .send({ donor_id: donor.id });
  expect(invite.status).toBe(201);
  await admin
    .patch('/api/v1/blood-donations/' + invite.body.data.id + '/cancel')
    .set(CSRF)
    .send({ note: 'Hospital changed its plan' })
    .expect(200);
  const notices = await db.query(
    "SELECT message FROM notifications WHERE user_id=? AND type='donation'",
    [donor.id]
  );
  expect(notices.at(-1).message).toMatch(/invitation was withdrawn/);
  expect(notices.at(-1).message).not.toMatch(/planned/);
});
test('cancelling a request does not thank an unanswered invitee for an offer they never made', async () => {
  const id = await openRequest();
  await admin
    .post('/api/v1/blood-requests/' + id + '/invitations')
    .set(CSRF)
    .send({ donor_id: donor.id })
    .expect(201);
  await admin
    .patch('/api/v1/blood-requests/' + id + '/cancel')
    .set(CSRF)
    .expect(200);
  const notices = await db.query(
    "SELECT message FROM notifications WHERE user_id=? AND type='request'",
    [donor.id]
  );
  expect(notices.at(-1).message).toMatch(/invitation has been withdrawn/);
});
test.each([false, true])(
  'a donor can resubmit a withdrawn offer, requiring a fresh acceptance (was accepted: %s)',
  async (accepted) => {
    const id = await openRequest();
    const old = await withdrawn(id, accepted);
    const listed = (await donorAgent.get('/api/v1/blood-requests')).body.data.find(
      (r) => r.id === id
    );
    expect(listed.can_offer_again).toBe(true);
    const res = await offer(id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: old,
      status: 'pending',
      accepted_at: null,
      can_offer_again: false
    });
    expect(
      (await donorAgent.get('/api/v1/blood-requests/' + id)).body.data.can_offer_again
    ).toBe(false);
    const [count] = await db.query(
      'SELECT COUNT(*) AS total FROM blood_donations WHERE request_id=? AND donor_id=?',
      [id, donor.id]
    );
    expect(count.total).toBe(1);
    const [requestRow] = await db.query(
      'SELECT units_received FROM blood_requests WHERE id=?',
      [id]
    );
    expect(requestRow.units_received).toBe(0);
    await admin
      .patch('/api/v1/blood-donations/' + old + '/confirm')
      .set(CSRF)
      .expect(409);
    await admin
      .patch('/api/v1/blood-donations/' + old + '/accept')
      .set(CSRF)
      .expect(200);
  }
);
test('an administrator cancellation cannot be reopened even if its reason mimics the withdrawal text', async () => {
  const id = await openRequest();
  const res = await offer(id);
  await admin
    .patch('/api/v1/blood-donations/' + res.body.data.id + '/cancel')
    .set(CSRF)
    .send({ note: 'Withdrawn by the donor.' })
    .expect(200);
  expect((await offer(id)).status).toBe(409);
});
test('declined invitations cannot be reoffered as withdrawn offers', async () => {
  const id = await openRequest();
  const res = await admin
    .post('/api/v1/blood-requests/' + id + '/invitations')
    .set(CSRF)
    .send({ donor_id: donor.id });
  await donorAgent
    .patch('/api/v1/blood-donations/' + res.body.data.id + '/respond')
    .set(CSRF)
    .send({ accept: false })
    .expect(200);
  expect((await offer(id)).status).toBe(409);
});
test('request closure prevents reoffering', async () => {
  const id = await openRequest();
  await withdrawn(id);
  await admin
    .patch('/api/v1/blood-requests/' + id + '/cancel')
    .set(CSRF)
    .expect(200);
  expect((await offer(id)).status).toBe(404);
});
test('the waiting period is checked again before reoffering', async () => {
  const id = await openRequest();
  await withdrawn(id);
  await setLastDonation(donor.id, daysAgo(1));
  expect((await offer(id)).status).toBe(409);
});
test('parallel reoffers create one pending record and one new admin notice', async () => {
  const id = await openRequest();
  await withdrawn(id);
  const [before] = await db.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND type='donation'",
    [adminUser.id]
  );
  const res = await Promise.all([offer(id), offer(id)]);
  expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
  const [after] = await db.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND type='donation'",
    [adminUser.id]
  );
  expect(after.total - before.total).toBe(1);
});
test('audit failure rolls a reoffer and its notifications back', async () => {
  const id = await openRequest();
  const donationId = await withdrawn(id);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('QA audit unavailable'));
  expect((await offer(id)).status).toBe(500);
  const [row] = await db.query(
    'SELECT status,admin_note FROM blood_donations WHERE id=?',
    [donationId]
  );
  expect(row).toMatchObject({
    status: 'cancelled',
    admin_note: 'Withdrawn by the donor.'
  });
});
