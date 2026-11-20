// Builds the Express application. server.js starts it; the tests import it directly.
//
// 3-tier architecture (course slides 103-106):
//   client (browser) -> PL -> BLL -> DAL -> MySQL
//   PL/   Presentation layer: the API
//         routes, controllers, request validation and security checks
//   BLL/  Business logic layer: the rules
//   DAL/  Data access layer: the only code that queries the database
//   DTO/  objects that carry data between the layers
//
// Every API request passes, top to bottom:
//   security headers -> CORS -> rate limit -> JSON body (100 KB max) -> server session -> CSRF check
//   -> route -> [sign-in / role check] -> validation -> controller -> BLL -> DAL
'use strict';

const path = require('node:path');
const express = require('express');
const { sessionMiddleware } = require('./PL/session');
const config = require('./config');
const { securityHeaders, corsPolicy, apiLimiter } = require('./PL/middleware/security');
const { requireCsrfHeader } = require('./PL/middleware/csrf');
const { requestLogger } = require('./PL/middleware/requestLogger');
const { errorHandler, notFound } = require('./PL/middleware/errorHandler');
const { docsRouter } = require('./PL/docs/swagger');
const apiRoutes = require('./PL/routes');
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

function createApp() {
  const app = express();
  if (!config.isTest) {
    app.use(requestLogger);
  }
  app.use(securityHeaders);
  app.use(corsPolicy);

  // The website: files the browser downloads (Presentation layer)
  app.use('/assets', express.static(path.join(FRONTEND_DIR, 'Assets')));
  app.get('/assets/lebanon.json', (req, res) =>
    res.sendFile(path.join(__dirname, 'shared', 'lebanon.json'))
  );
  app.use('/scripts', express.static(path.join(FRONTEND_DIR, 'Scripts')));
  app.use('/styles', express.static(path.join(FRONTEND_DIR, 'Styles')));
  app.get('/', (req, res) =>
    res.sendFile(path.join(FRONTEND_DIR, 'Views', 'index.html'))
  );

  // The API the pages call with AJAX
  app.use('/api', docsRouter);
  app.use('/api', apiLimiter);
  app.use(
    '/api',
    express.json({
      limit: '100kb'
    })
  );
  app.use('/api', sessionMiddleware());
  app.use('/api', requireCsrfHeader);
  app.use('/api/v1', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
module.exports = {
  createApp
};
