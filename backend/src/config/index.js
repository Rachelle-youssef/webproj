// Reads every setting from backend/.env once, checks it, and exports a frozen object.
// A missing or wrong setting stops the server at start-up with a clear message,
// instead of failing later in the middle of a request.
'use strict';

require('dotenv').config({
  quiet: true
});
const ENVIRONMENTS = ['development', 'test', 'production'];
const problems = [];

function text(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    problems.push(`${name} is missing`);
  }
  return value;
}

function integer(name, fallback, min, max) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function origins(name, fallback) {
  const list = (process.env[name] ?? fallback)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of list) {
    let ok = false;
    try {
      const u = new URL(origin);
      ok = ['http:', 'https:'].includes(u.protocol) && u.origin === origin;
    } catch {
      ok = false;
    }
    if (!ok) {
      problems.push(
        `${name}: "${origin}" is not an origin like http://localhost:5500 (no path, no trailing slash)`
      );
    }
  }
  return list;
}

function timeZone(name, fallback) {
  const value = process.env[name] || fallback;
  try {
    new Intl.DateTimeFormat('en', {
      timeZone: value
    });
  } catch {
    problems.push(`${name}: "${value}" is not a time zone such as Asia/Beirut`);
  }
  return value;
}
const env = process.env.NODE_ENV || 'development';
if (!ENVIRONMENTS.includes(env)) {
  problems.push(`NODE_ENV must be one of ${ENVIRONMENTS.join(', ')}`);
}

function secret(name) {
  const value = process.env[name] ?? '';
  if (value.length < 32) {
    problems.push(
      `${name} must be at least 32 random characters (see .env.example for a command that makes one)`
    );
  }
  return value;
}
const config = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: integer('PORT', 3000, 1, 65535),
  timeZone: timeZone('APP_TIME_ZONE', 'Asia/Beirut'),
  // decides what "today" is for donation dates
  corsOrigins: origins('CORS_ORIGINS', ''),
  // other sites allowed to call the API (none by default)
  rateLimit: {
    windowMinutes: integer('RATE_LIMIT_WINDOW_MINUTES', 15, 1, 1440),
    max: integer('RATE_LIMIT_MAX', 300, 1, 100000),
    authMax: integer('AUTH_RATE_LIMIT_MAX', 10, 1, 100000) // sign-in and sign-up attempts per window
  },
  session: {
    // Accept the old key so an existing Step 11 .env still works.
    secret: secret(
      process.env.SESSION_SECRET !== undefined ? 'SESSION_SECRET' : 'JWT_SECRET'
    ),
    hours: integer('SESSION_HOURS', 8, 1, 24)
  },
  db: {
    host: text('DB_HOST', '127.0.0.1'),
    port: integer('DB_PORT', 3306, 1, 65535),
    name: text('DB_NAME', 'lifelink'),
    user: text('DB_USER', 'lifelink_app'),
    password: text('DB_PASSWORD'),
    connectionLimit: integer('DB_POOL_SIZE', 10, 1, 100)
  }
};
if (problems.length) {
  throw new Error(`Invalid settings in backend/.env:\n  - ${problems.join('\n  - ')}`);
}
module.exports = Object.freeze(config);
