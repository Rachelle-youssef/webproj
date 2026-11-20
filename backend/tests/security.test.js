// Checks the security layers every request passes through (brief: "security levels").
'use strict';

const express = require('express');
const request = require('supertest');
const { createApp } = require('../src/app');
const { limiter } = require('../src/PL/middleware/security');
const { errorHandler } = require('../src/PL/middleware/errorHandler');
const db = require('../src/DAL/db');
const app = createApp();
const INTERFACE = 'http://localhost:5500';
afterAll(() => db.close());
describe('security headers (helmet)', () => {
  test('are sent on every reply', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(res.headers['content-security-policy']).toContain(
      "img-src 'self' data: https://tile.openstreetmap.org"
    );
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests'
    ); // production only
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
describe('CORS allow-list', () => {
  test('lets the LifeLink interface call the API with its cookie', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', INTERFACE);
    expect(res.headers['access-control-allow-origin']).toBe(INTERFACE);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
  test('gives no permission to any other site', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('answers the preflight for the CSRF header', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', INTERFACE)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Requested-With/i);
  });
});
describe('CSRF header', () => {
  test('is required on requests that change data', async () => {
    const res = await request(app).post('/api/v1/anything').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });
  test('lets the request through when present', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('X-Requested-With', 'LifeLink')
      .send({});
    expect(res.status).toBe(404); // passed the CSRF check; the route simply does not exist yet
  });
  test('is not needed for reading', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});
describe('request bodies', () => {
  test('broken JSON gets 400 BAD_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('X-Requested-With', 'LifeLink')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });
  test('bodies over 100 KB get 413', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('X-Requested-With', 'LifeLink')
      .send({
        text: 'x'.repeat(110 * 1024)
      });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
describe('the website (Presentation layer files)', () => {
  test('serves the page, its script, style and image', async () => {
    const page = await request(app).get('/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.text).toContain('LifeLink');
    expect((await request(app).get('/scripts/main.js')).headers['content-type']).toMatch(
      /javascript/
    );
    expect((await request(app).get('/styles/main.css')).headers['content-type']).toMatch(
      /text\/css/
    );
    expect(
      (await request(app).get('/assets/favicon.svg')).headers['content-type']
    ).toMatch(/svg/);
  });
  test.each([
    '/.env',
    '/scripts/../../.env',
    '/scripts/%2e%2e%2f%2e%2e%2f.env',
    '/src/app.js',
    '/PL/Views/index.html',
    '/package.json'
  ])('never exposes server files: %s', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).not.toBe(200);
    expect(res.text).not.toMatch(/DB_PASSWORD|SESSION_SECRET|JWT_SECRET|require\(/);
  });
});
describe('unknown endpoints', () => {
  test('get a JSON 404 in the standard error shape', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'No endpoint GET /api/v1/nope.'
      }
    });
  });
});
describe('rate limiting', () => {
  test('refuses requests over the limit with 429 and tells the client when to retry', async () => {
    const small = express();
    small.use(
      limiter({
        windowMinutes: 1,
        max: 2,
        message: 'Slow down.'
      })
    );
    small.get('/', (req, res) =>
      res.json({
        ok: true
      })
    );
    small.use(errorHandler);
    await request(small).get('/');
    await request(small).get('/');
    const res = await request(small).get('/');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Slow down.'
      }
    });
    expect(res.headers.ratelimit).toBeDefined();
  });
  test('the API sends rate-limit headers', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });
});
describe('API documentation', () => {
  test('serves the OpenAPI description and the Swagger UI page', async () => {
    const spec = await request(app).get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.paths['/health']).toBeDefined();
    const page = await request(app).get('/api/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');
  });
});
