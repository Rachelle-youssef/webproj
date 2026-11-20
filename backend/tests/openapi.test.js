// Keeps the documentation honest: every endpoint in openapi.yaml must exist in the code.
'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { spec } = require('../src/PL/docs/swagger');
const db = require('../src/DAL/db');
const app = createApp();
afterAll(() => db.close());
const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.keys(methods).map((method) => [method.toUpperCase(), path])
);
test.each(operations)('%s %s is implemented', async (method, path) => {
  const url = `/api/v1${path.replace(/\{[^}]+\}/g, '1')}`;
  const res = await request(app)
    [method.toLowerCase()](url)
    .set('X-Requested-With', 'LifeLink')
    .send({});
  expect(res.body?.error?.message ?? '').not.toMatch(/^No endpoint/);
});
