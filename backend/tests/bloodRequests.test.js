'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const {
  CSRF,
  cleanDatabase,
  createUser,
  signIn,
  daysAgo,
  setLastDonation,
  notificationsOf
} = require('./helpers');
const app = createApp();
afterAll(() => db.close());
const BEIRUT = {
  city: 'Beirut',
  latitude: 33.893791,
  longitude: 35.501778
};
const TRIPOLI = {
  city: 'Tripoli',
  latitude: 34.436667,
  longitude: 35.849722
};
const SAIDA = {
  city: 'Saida',
  latitude: 33.557069,
  longitude: 35.372948
};
const TYPE = {
  'A+': 1,
  'A-': 2,
  'B+': 3,
  'B-': 4,
  'AB+': 5,
  'AB-': 6,
  'O+': 7,
  'O-': 8
};
let adminUser;
let admin;
let hospitalUser;
let hospital;
beforeEach(async () => {
  await cleanDatabase();
  adminUser = await createUser({
    role: 'admin'
  });
  admin = await signIn(app, adminUser);
  hospitalUser = await createUser({
    role: 'hospital',
    full_name: 'AUBMC',
    ...BEIRUT
  });
  hospital = await signIn(app, hospitalUser);
});
const newRequest = (agent, body = {}) =>
  agent
    .post('/api/v1/blood-requests')
    .set(CSRF)
    .send({
      blood_type_id: TYPE['O+'],
      units_needed: 2,
      hospital_name: 'AUBMC',
      ...body
    });
const review = (
  id,
  body = {
    decision: 'approve'
  }
) => admin.patch(`/api/v1/blood-requests/${id}/review`).set(CSRF).send(body);

async function openRequest(body) {
  const created = await newRequest(hospital, body);
  return (await review(created.body.data.id)).body.data;
}
describe('creating a request', () => {
  test('a hospital creates a pending request at its own place, and admins are alerted', async () => {
    const res = await newRequest(hospital, {
      urgency: 'urgent'
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      blood_type: 'O+',
      units_needed: 2,
      units_received: 0,
      urgency: 'urgent',
      city: 'Beirut',
      latitude: 33.893791,
      longitude: 35.501778,
      requester: {
        id: hospitalUser.id,
        full_name: 'AUBMC'
      }
    });
    expect(await notificationsOf(adminUser.id)).toEqual([
      expect.objectContaining({
        type: 'request',
        link: '#/queue'
      })
    ]);
  });
  test('donors cannot create requests', async () => {
    const donor = await signIn(
      app,
      await createUser({
        role: 'donor'
      })
    );
    expect((await newRequest(donor)).status).toBe(403);
  });
  test('every invalid field is listed', async () => {
    const res = await newRequest(hospital, {
      blood_type_id: 9,
      units_needed: 0,
      urgency: 'panic',
      hospital_name: ''
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(
      expect.arrayContaining([
        'blood_type_id',
        'units_needed',
        'urgency',
        'hospital_name'
      ])
    );
  });
  test('a requester can have at most 5 active requests', async () => {
    for (let i = 0; i < 5; i += 1) expect((await newRequest(hospital)).status).toBe(201);
    const sixth = await newRequest(hospital);
    expect(sixth.status).toBe(409);
  });
  test('blood types for the forms are public', async () => {
    const res = await request(app).get('/api/v1/blood-types');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(8);
    expect(res.body.data[7]).toEqual({
      id: 8,
      label: 'O-'
    });
  });
});
describe('who sees which requests', () => {
  let oPos;
  let aPos;
  let abPosSos;
  beforeEach(async () => {
    oPos = await openRequest({
      blood_type_id: TYPE['O+']
    });
    aPos = await openRequest({
      blood_type_id: TYPE['A+']
    });
    abPosSos = await openRequest({
      blood_type_id: TYPE['AB+'],
      urgency: 'sos'
    });
    await newRequest(hospital, {
      blood_type_id: TYPE['B-']
    }); // stays pending
  });
  test('a requester sees only their own requests', async () => {
    const patient = await signIn(
      app,
      await createUser({
        role: 'recipient'
      })
    );
    await newRequest(patient, {
      blood_type_id: TYPE['A-']
    });
    const mine = await patient.get('/api/v1/blood-requests');
    expect(mine.body.data).toHaveLength(1);
    expect((await hospital.get('/api/v1/blood-requests')).body.meta.total).toBe(4);
  });
  test('admins see everything and can filter', async () => {
    const pending = await admin.get('/api/v1/blood-requests?status=pending');
    expect(pending.body.data.map((r) => r.blood_type)).toEqual(['B-']);
    expect((await admin.get('/api/v1/blood-requests')).body.meta.total).toBe(4);
  });
  test('a donor sees only open requests they can give to, SOS first, without the requester identity', async () => {
    const oNeg = await signIn(
      app,
      await createUser({
        role: 'donor',
        bloodTypeId: TYPE['O-']
      })
    );
    const list = await oNeg.get('/api/v1/blood-requests');
    expect(list.body.data.map((r) => r.blood_type)).toEqual([
      'AB+',
      expect.any(String),
      expect.any(String)
    ]);
    expect(list.body.data[0]).toMatchObject({
      id: abPosSos.id,
      urgency: 'sos',
      my_response: null
    });
    expect(list.body.data[0]).not.toHaveProperty('requester');
    expect(list.body.data[0]).not.toHaveProperty('admin_note');
    const aPosDonor = await signIn(
      app,
      await createUser({
        role: 'donor',
        bloodTypeId: TYPE['A+']
      })
    );
    const theirs = await aPosDonor.get('/api/v1/blood-requests');
    expect(theirs.body.data.map((r) => r.id).sort()).toEqual(
      [aPos.id, abPosSos.id].sort()
    );
  });
  test('a request is "not found" for anyone who may not see it', async () => {
    const otherPatient = await signIn(
      app,
      await createUser({
        role: 'recipient'
      })
    );
    expect((await otherPatient.get(`/api/v1/blood-requests/${oPos.id}`)).status).toBe(
      404
    );
    const incompatible = await signIn(
      app,
      await createUser({
        role: 'donor',
        bloodTypeId: TYPE['A+']
      })
    );
    expect((await incompatible.get(`/api/v1/blood-requests/${oPos.id}`)).status).toBe(
      404
    );
    const compatible = await signIn(
      app,
      await createUser({
        role: 'donor',
        bloodTypeId: TYPE['O+']
      })
    );
    expect(
      (await compatible.get(`/api/v1/blood-requests/${oPos.id}`)).body.data
    ).toMatchObject({
      id: oPos.id,
      my_response: null
    });
  });
});
describe('reviewing a request', () => {
  test('approving opens it and tells the requester', async () => {
    const created = await newRequest(hospital);
    const res = await review(created.body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('open');
    expect(await notificationsOf(hospitalUser.id)).toEqual([
      expect.objectContaining({
        type: 'request',
        message: expect.stringMatching(/approved/)
      })
    ]);
  });
  test('denying needs a reason, which the requester sees', async () => {
    const { body } = await newRequest(hospital);
    expect(
      (
        await review(body.data.id, {
          decision: 'deny'
        })
      ).status
    ).toBe(400);
    const denied = await review(body.data.id, {
      decision: 'deny',
      note: 'Duplicate of request #3'
    });
    expect(denied.body.data).toMatchObject({
      status: 'cancelled',
      admin_note: 'Duplicate of request #3'
    });
    expect(
      (await hospital.get(`/api/v1/blood-requests/${body.data.id}`)).body.data.admin_note
    ).toBe('Duplicate of request #3');
  });
  test('a request is reviewed only once, and only by admins', async () => {
    const { body } = await newRequest(hospital);
    expect(
      (
        await hospital
          .patch(`/api/v1/blood-requests/${body.data.id}/review`)
          .set(CSRF)
          .send({
            decision: 'approve'
          })
      ).status
    ).toBe(403);
    await review(body.data.id);
    expect((await review(body.data.id)).status).toBe(409);
  });
  test('an approved SOS alerts only donors who can give blood right now', async () => {
    const ready = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O-']
    });
    const unavailable = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O-'],
      isAvailable: false
    });
    const tooSoon = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O-']
    });
    await setLastDonation(tooSoon.id, daysAgo(10));
    const wrongType = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['A+']
    });
    await openRequest({
      blood_type_id: TYPE['O-'],
      urgency: 'sos'
    });
    expect(await notificationsOf(ready.id)).toEqual([
      expect.objectContaining({
        type: 'sos',
        message: expect.stringMatching(/^SOS: AUBMC, Beirut urgently needs O- blood/)
      })
    ]);
    for (const donor of [unavailable, tooSoon, wrongType])
      expect(await notificationsOf(donor.id)).toEqual([]);
  });
});
describe('matching donors (admins only)', () => {
  test('lists compatible, available, eligible donors, nearest first, unknown location last', async () => {
    const saida = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O-'],
      full_name: 'Sara (Saida)',
      ...SAIDA
    });
    const tripoli = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O+'],
      full_name: 'Karim (Tripoli)',
      ...TRIPOLI
    });
    const nowhere = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O-'],
      full_name: 'Rami (no location)'
    });
    await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O+'],
      isAvailable: false,
      ...BEIRUT
    });
    const recent = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O+'],
      ...BEIRUT
    });
    await setLastDonation(recent.id, daysAgo(20));
    await createUser({
      role: 'donor',
      bloodTypeId: TYPE['A+'],
      ...BEIRUT
    });
    const open = await openRequest({
      blood_type_id: TYPE['O+']
    });
    const res = await admin.get(`/api/v1/blood-requests/${open.id}/matches`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        donor_id: saida.id,
        blood_type: 'O-',
        distance_km: 39.3
      }),
      expect.objectContaining({
        donor_id: tripoli.id,
        blood_type: 'O+',
        distance_km: 68.3
      }),
      expect.objectContaining({
        donor_id: nowhere.id,
        distance_km: null
      })
    ]);
  });
  test('an invited donor is no longer listed', async () => {
    const donor = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O+']
    });
    const open = await openRequest();
    await admin.post(`/api/v1/blood-requests/${open.id}/invitations`).set(CSRF).send({
      donor_id: donor.id
    });
    expect(
      (await admin.get(`/api/v1/blood-requests/${open.id}/matches`)).body.data
    ).toEqual([]);
  });
  test('hospitals cannot see donor matches', async () => {
    const open = await openRequest();
    expect((await hospital.get(`/api/v1/blood-requests/${open.id}/matches`)).status).toBe(
      403
    );
  });
});
describe('cancelling a request', () => {
  test('the requester cancels; donors still waiting are released and told', async () => {
    const donorUser = await createUser({
      role: 'donor',
      bloodTypeId: TYPE['O+']
    });
    const donor = await signIn(app, donorUser);
    const open = await openRequest();
    const offer = await donor.post('/api/v1/blood-donations').set(CSRF).send({
      request_id: open.id
    });
    const res = await hospital
      .patch(`/api/v1/blood-requests/${open.id}/cancel`)
      .set(CSRF)
      .send({});
    expect(res.body.data.status).toBe('cancelled');
    const donation = (await donor.get('/api/v1/blood-donations')).body.data.find(
      (d) => d.id === offer.body.data.id
    );
    expect(donation).toMatchObject({
      status: 'cancelled',
      admin_note: 'The request was cancelled.'
    });
    expect((await notificationsOf(donorUser.id)).at(-1).message).toMatch(/was cancelled/);
  });
  test('nobody else can cancel it, and a cancelled request cannot be cancelled again', async () => {
    const open = await openRequest();
    const otherHospital = await signIn(
      app,
      await createUser({
        role: 'hospital'
      })
    );
    expect(
      (
        await otherHospital
          .patch(`/api/v1/blood-requests/${open.id}/cancel`)
          .set(CSRF)
          .send({})
      ).status
    ).toBe(404);
    await hospital.patch(`/api/v1/blood-requests/${open.id}/cancel`).set(CSRF).send({});
    expect(
      (
        await hospital
          .patch(`/api/v1/blood-requests/${open.id}/cancel`)
          .set(CSRF)
          .send({})
      ).status
    ).toBe(409);
  });
});
