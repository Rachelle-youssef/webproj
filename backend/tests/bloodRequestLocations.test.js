'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const audit = require('../src/DAL/audit.dal');
const { cleanDatabase, createUser, signIn, CSRF } = require('./helpers');
const app = createApp();
const point = {
  latitude: 33.893791,
  longitude: 35.501778
};
let owner, hospital, admin, id;
beforeEach(async () => {
  await cleanDatabase();
  owner = await createUser({
    role: 'hospital'
  });
  hospital = await signIn(app, owner);
  admin = await signIn(
    app,
    await createUser({
      role: 'admin'
    })
  );
  const response = await hospital.post('/api/v1/blood-requests').set(CSRF).send({
    blood_type_id: 8,
    units_needed: 2,
    hospital_name: 'Location Test Hospital'
  });
  id = response.body.data.id;
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());
const update = (agent, body = point, requestId = id) =>
  agent
    .patch('/api/v1/blood-requests/' + requestId + '/location')
    .set(CSRF)
    .send(body);

test.each([
  ['Beirut', 33.89, 35.472],
  ['Tripoli', 34.44, 35.812]
])(
  'detailed boundary retains the %s coastal location',
  async (city, latitude, longitude) => {
    const coordinates = { latitude, longitude };
    expect((await update(hospital, coordinates)).status).toBe(200);
    await admin
      .patch('/api/v1/blood-requests/' + id + '/review')
      .set(CSRF)
      .send({
        decision: 'approve'
      });
    const response = await hospital.get('/api/v1/feed/map');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({ id, ...coordinates })]);
  }
);

test('hospital can add a missing location to a pending request, with an audit event', async () => {
  const response = await update(hospital, {
    ...point,
    status: 'fulfilled',
    units_received: 99
  });
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    ...point,
    status: 'pending',
    units_needed: 2,
    units_received: 0
  });
  const rows = await db.query(
    "SELECT user_id, entity_id FROM audit_logs WHERE action = 'blood_request.location_updated'"
  );
  expect(rows).toEqual([
    expect.objectContaining({
      user_id: owner.id,
      entity_id: id
    })
  ]);
  expect((await hospital.get('/api/v1/feed/map')).body.meta.total).toBe(0);
});
test('approved hospital request becomes visible after setting its location', async () => {
  await admin
    .patch('/api/v1/blood-requests/' + id + '/review')
    .set(CSRF)
    .send({
      decision: 'approve'
    });
  expect((await update(hospital)).status).toBe(200);
  expect((await hospital.get('/api/v1/feed/map')).body.data).toEqual([
    expect.objectContaining({
      id,
      ...point
    })
  ]);
});
test('another hospital cannot edit this location, while an admin can', async () => {
  const other = await signIn(
    app,
    await createUser({
      role: 'hospital'
    })
  );
  expect((await update(other)).status).toBe(404);
  expect((await update(admin)).status).toBe(200);
  expect((await update(hospital, point, 4294967295)).status).toBe(404);
});
test.each(['donor'])('%s cannot use the location endpoint', async (role) => {
  const agent = await signIn(
    app,
    await createUser({
      role
    })
  );
  expect((await update(agent)).status).toBe(403);
});
test('anonymous requests and missing CSRF headers are rejected', async () => {
  expect(
    (
      await request(app)
        .patch('/api/v1/blood-requests/' + id + '/location')
        .set(CSRF)
        .send(point)
    ).status
  ).toBe(401);
  expect(
    (await hospital.patch('/api/v1/blood-requests/' + id + '/location').send(point))
      .status
  ).toBe(403);
});
test.each([
  {},
  {
    latitude: point.latitude
  },
  {
    ...point,
    longitude: null
  },
  {
    latitude: 0,
    longitude: 0
  },
  {
    latitude: 51.5,
    longitude: -0.12
  },
  {
    latitude: 34.6,
    longitude: 35.6
  },
  {
    latitude: 'bad',
    longitude: 35.5
  }
])('invalid or outside-Lebanon location is rejected %#', async (body) => {
  expect((await update(hospital, body)).status).toBe(400);
  const [row] = await db.query(
    'SELECT latitude, longitude FROM blood_requests WHERE id = ?',
    [id]
  );
  expect(row).toEqual({
    latitude: null,
    longitude: null
  });
});
test('closed requests cannot have their location changed', async () => {
  await hospital
    .patch('/api/v1/blood-requests/' + id + '/cancel')
    .set(CSRF)
    .send({});
  expect((await update(hospital)).status).toBe(409);
});
test('audit failure rolls back the coordinate update', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('test audit failure'));
  expect((await update(hospital)).status).toBe(500);
  const [row] = await db.query('SELECT latitude FROM blood_requests WHERE id = ?', [id]);
  expect(row.latitude).toBeNull();
});
test('map excludes legacy overseas and nearby foreign/coastal coordinates before pagination', async () => {
  for (const coordinates of [
    point,
    {
      latitude: 0,
      longitude: 0
    },
    {
      latitude: 34.6,
      longitude: 35.6
    }
  ]) {
    const response = await admin
      .post('/api/v1/calls/blood')
      .set(CSRF)
      .send({
        ...coordinates,
        blood_type_id: 8,
        units_needed: 1,
        hospital_name: 'Country Boundary Test'
      });
    expect(response.status).toBe(201);
  }
  const response = await hospital.get('/api/v1/feed/map?limit=1');
  expect(response.status).toBe(200);
  expect(response.body.meta).toMatchObject({
    total: 1,
    pages: 1
  });
  expect(response.body.data[0]).toMatchObject(point);
});
