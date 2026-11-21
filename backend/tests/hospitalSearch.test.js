'use strict';
const request = require('supertest');
const { createApp } = require('../src/app');
const locationsDAL = require('../src/DAL/locations.dal');
const { ServiceUnavailableError } = require('../src/shared/errors');
const db = require('../src/DAL/db');
const app = createApp();
afterAll(() => db.close());
afterEach(() => jest.restoreAllMocks());

test('public signup lookup returns only candidates inside the actual Lebanon boundary', async () => {
  jest.spyOn(locationsDAL, 'search').mockResolvedValue([
    {
      name: 'Beirut Hospital',
      address: 'Beirut, Lebanon',
      latitude: 33.89,
      longitude: 35.51
    },
    { name: 'Outside', address: 'Not Lebanon', latitude: 48.8, longitude: 2.3 }
  ]);
  const res = await request(app).get(
    '/api/v1/hospital-locations?name=Hospital&city=Beirut'
  );
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.data[0].name).toBe('Beirut Hospital');
});

test.each([
  'name=Hospital',
  'city=Beirut',
  'name=x&city=Beirut',
  'name=Hospital&city=x',
  'name[]=Hospital&city=Beirut',
  'name=' + 'a'.repeat(121) + '&city=Beirut'
])('rejects invalid hospital search input: %s', async (query) => {
  const search = jest.spyOn(locationsDAL, 'search');
  const res = await request(app).get('/api/v1/hospital-locations?' + query);
  expect(res.status).toBe(400);
  expect(search).not.toHaveBeenCalled();
});

test('no hospital found returns an empty list rather than a guessed pin', async () => {
  jest.spyOn(locationsDAL, 'search').mockResolvedValue([]);
  const res = await request(app).get(
    '/api/v1/hospital-locations?name=Unknown&city=Beirut'
  );
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual([]);
});

test('provider outage is a standard 503 response', async () => {
  jest
    .spyOn(locationsDAL, 'search')
    .mockRejectedValue(new ServiceUnavailableError('Hospital search is unavailable.'));
  const res = await request(app).get(
    '/api/v1/hospital-locations?name=Offline&city=Beirut'
  );
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
});
