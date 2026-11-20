// PL: security layers applied to every request before it reaches a route:
// security headers (helmet), the CORS allow-list and rate limiting.
'use strict';

const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const config = require('../../config');
const { AppError } = require('../../shared/errors');
const { CSRF_HEADER } = require('./csrf');

// Security headers.
// - Scripts stay same-origin. Map images also allow the OpenStreetMap tile host.
// - "upgrade-insecure-requests" forces https; it is only sent in production,
//   because on http://localhost it would break the pages during development.
// - Cross-Origin-Resource-Policy "same-site" lets a page on another local port show
//   images this server sends (only needed if the interface is served elsewhere).
const securityHeaders = helmet({
  crossOriginResourcePolicy: {
    policy: 'same-site'
  },
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: config.isProduction ? [] : null,
      imgSrc: ["'self'", 'data:', 'https://tile.openstreetmap.org']
    }
  }
});

// The pages LifeLink serves itself are same-origin and need no CORS permission.
// CORS_ORIGINS lists any other address allowed to call the API with the user's cookie
// (empty by default: no other website may).
const corsPolicy = cors({
  origin(origin, callback) {
    callback(null, Boolean(origin) && config.corsOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', CSRF_HEADER],
  maxAge: 600 // browsers may cache the preflight answer for 10 minutes
});

function limiter({ windowMinutes, max, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => next(new AppError('RATE_LIMITED', message))
  });
}

// General cap for the whole API.
const apiLimiter = limiter({
  windowMinutes: config.rateLimit.windowMinutes,
  max: config.rateLimit.max,
  message: 'Too many requests. Please wait a few minutes and try again.'
});
module.exports = {
  securityHeaders,
  corsPolicy,
  apiLimiter,
  limiter
};
