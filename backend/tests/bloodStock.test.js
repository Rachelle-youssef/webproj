'use strict';

const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const { CSRF, cleanDatabase, createUser, signIn, notificationsOf } = require('./helpers');
const app = createApp();
afterAll(() => db.close());
const TYPE = {
  'A+': 1,
  'B+': 3,
  'O+': 7,
  'O-': 8
};
let admin;
let hospitalUser;
let hospital;
beforeEach(async () => {
  await cleanDatabase();
  admin = await signIn(
    app,
    await createUser({
      role: 'admin'
    })
  );
  hospitalUser = await createUser({
    role: 'hospital',
    full_name: 'AUBMC'
  });
  hospital = await signIn(app, hospitalUser);
});
const adjust = (body) =>
  admin.post('/api/v1/blood-stock/adjustments').set(CSRF).send(body);
const stockOf = async (label) =>
  (await admin.get('/api/v1/blood-stock')).body.data.find((s) => s.blood_type === label)
    .units_available;

async function openRequest(bloodType, units) {
  const created = await hospital.post('/api/v1/blood-requests').set(CSRF).send({
    blood_type_id: TYPE[bloodType],
    units_needed: units,
    hospital_name: 'AUBMC'
  });
  return (
    await admin
      .patch(`/api/v1/blood-requests/${created.body.data.id}/review`)
      .set(CSRF)
      .send({
        decision: 'approve'
      })
  ).body.data;
}
const dispense = (requestId, body) =>
  admin.post(`/api/v1/blood-requests/${requestId}/dispense`).set(CSRF).send(body);
describe('stock levels', () => {
  test('admins and hospitals see all 8 blood types; donors do not', async () => {
    const res = await hospital.get('/api/v1/blood-stock');
    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.blood_type)).toEqual([
      'A+',
      'A-',
      'B+',
      'B-',
      'AB+',
      'AB-',
      'O+',
      'O-'
    ]);
    const donor = await signIn(
      app,
      await createUser({
        role: 'donor'
      })
    );
    expect((await donor.get('/api/v1/blood-stock')).status).toBe(403);
  });
});
describe('manual adjustments (admins)', () => {
  test('add and remove units, each with a recorded reason', async () => {
    expect(
      (
        await adjust({
          blood_type_id: TYPE['O-'],
          change_units: 5,
          note: 'Opening stock'
        })
      ).body.data
    ).toMatchObject({
      blood_type: 'O-',
      units_available: 5
    });
    await adjust({
      blood_type_id: TYPE['O-'],
      change_units: -2,
      note: 'Expired units discarded'
    });
    expect(await stockOf('O-')).toBe(3);
    const history = (await admin.get('/api/v1/blood-stock/movements?reason=adjustment'))
      .body;
    expect(history.data.map((m) => [m.change_units, m.note])).toEqual([
      [-2, 'Expired units discarded'],
      [5, 'Opening stock']
    ]);
    expect(history.data[0].created_by).toMatch(/^Test admin/);
  });
  test('the stock never goes below zero', async () => {
    await adjust({
      blood_type_id: TYPE['O-'],
      change_units: 2,
      note: 'Opening stock'
    });
    const res = await adjust({
      blood_type_id: TYPE['O-'],
      change_units: -3,
      note: 'Too many'
    });
    expect(res.status).toBe(409);
    expect(await stockOf('O-')).toBe(2);
  });
  test('a change of 0 or a missing reason is refused', async () => {
    expect(
      (
        await adjust({
          blood_type_id: TYPE['O-'],
          change_units: 0,
          note: 'Nothing'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await adjust({
          blood_type_id: TYPE['O-'],
          change_units: 1
        })
      ).status
    ).toBe(400);
  });
});
describe('giving units from the blood bank to a request', () => {
  test('stock goes down, the request goes up, the history shows where the units went', async () => {
    await adjust({
      blood_type_id: TYPE['O-'],
      change_units: 5,
      note: 'Opening stock'
    });
    const request = await openRequest('A+', 3);
    const res = await dispense(request.id, {
      blood_type_id: TYPE['O-'],
      units: 2,
      note: 'Emergency surgery'
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      units_received: 2,
      status: 'open'
    });
    expect(await stockOf('O-')).toBe(3);
    const [latest] = (await admin.get('/api/v1/blood-stock/movements?reason=dispensed'))
      .body.data;
    expect(latest).toMatchObject({
      blood_type: 'O-',
      change_units: -2,
      request_id: request.id,
      note: 'Emergency surgery'
    });
    expect((await notificationsOf(hospitalUser.id)).at(-1).message).toBe(
      'Blood was provided by the blood bank for your request at AUBMC, Beirut (2 of 3 units).'
    );
  });
  test('giving the last units needed fulfils the request', async () => {
    await adjust({
      blood_type_id: TYPE['O+'],
      change_units: 4,
      note: 'Opening stock'
    });
    const request = await openRequest('O+', 2);
    expect(
      (
        await dispense(request.id, {
          blood_type_id: TYPE['O+'],
          units: 2
        })
      ).body.data.status
    ).toBe('fulfilled');
  });
  test('refuses an incompatible blood type, more than needed, or more than in stock', async () => {
    await adjust({
      blood_type_id: TYPE['B+'],
      change_units: 5,
      note: 'Opening stock'
    });
    await adjust({
      blood_type_id: TYPE['O-'],
      change_units: 1,
      note: 'Opening stock'
    });
    const request = await openRequest('A+', 2);
    const wrongType = await dispense(request.id, {
      blood_type_id: TYPE['B+'],
      units: 1
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.details[0].field).toBe('blood_type_id');
    const tooMany = await dispense(request.id, {
      blood_type_id: TYPE['O-'],
      units: 3
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.details[0].field).toBe('units');
    expect(
      (
        await dispense(request.id, {
          blood_type_id: TYPE['O-'],
          units: 2
        })
      ).status
    ).toBe(409);

    // Nothing changed after the refusals
    expect(await stockOf('O-')).toBe(1);
    expect(
      (await hospital.get(`/api/v1/blood-requests/${request.id}`)).body.data
        .units_received
    ).toBe(0);
  });
  test('two admins taking the last unit at the same moment: one succeeds, stock never goes negative', async () => {
    await adjust({
      blood_type_id: TYPE['O-'],
      change_units: 1,
      note: 'Last unit'
    });
    const first = await openRequest('O-', 1);
    const second = await openRequest('O-', 1);
    const results = await Promise.all([
      dispense(first.id, {
        blood_type_id: TYPE['O-'],
        units: 1
      }),
      dispense(second.id, {
        blood_type_id: TYPE['O-'],
        units: 1
      })
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf('O-')).toBe(0);
  });
  test('only admins can give units', async () => {
    const request = await openRequest('O+', 1);
    expect(
      (
        await hospital
          .post(`/api/v1/blood-requests/${request.id}/dispense`)
          .set(CSRF)
          .send({
            blood_type_id: TYPE['O+'],
            units: 1
          })
      ).status
    ).toBe(403);
  });
});
describe('stock history', () => {
  test('is paged and filterable by blood type', async () => {
    for (let i = 1; i <= 3; i += 1)
      await adjust({
        blood_type_id: TYPE['A+'],
        change_units: i,
        note: `Batch ${i}`
      });
    await adjust({
      blood_type_id: TYPE['O+'],
      change_units: 1,
      note: 'Other type'
    });
    const res = await admin.get(
      `/api/v1/blood-stock/movements?blood_type_id=${TYPE['A+']}&limit=2`
    );
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      pages: 2
    });
    expect(res.body.data.map((m) => m.note)).toEqual(['Batch 3', 'Batch 2']);
  });
});
