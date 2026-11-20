// Runs before every test file. Tests always use the separate test database
// (<DB_NAME>_test, created with npm run db:reset:test), never your real data.
'use strict';

require('dotenv').config({
  quiet: true
});
process.env.NODE_ENV = 'test';
process.env.DB_NAME = `${process.env.DB_NAME || 'lifelink'}_test`;
process.env.SESSION_SECRET ||= 'test-only-secret-that-is-at-least-32-characters-long';
process.env.AUTH_RATE_LIMIT_MAX ||= '1000'; // the rate-limit test lowers it on purpose
process.env.CORS_ORIGINS = 'http://localhost:5500'; // one allowed outside address, to test the CORS rules
