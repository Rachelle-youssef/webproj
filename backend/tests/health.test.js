'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const db = require('../src/DAL/db');
const healthDAL = require('../src/DAL/health.dal');
const app = createApp();
afterAll(() => db.close());
afterEach(() => jest.restoreAllMocks());
describe('GET /api/v1/health', () => {
  test('reports ok when the database answers', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      database: 'up',
      version: expect.any(String)
    });
    expect(new Date(res.body.data.time).toISOString()).toBe(res.body.data.time);
  });
  test('reports degraded with 503 when the database is down', async () => {
    jest.spyOn(healthDAL, 'ping').mockRejectedValue(
      Object.assign(new Error('down'), {
        code: 'ECONNREFUSED'
      })
    );
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({
      status: 'degraded',
      database: 'down'
    });
  });
});
