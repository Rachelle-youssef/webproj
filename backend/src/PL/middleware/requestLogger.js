// PL: prints one line per request:  GET /api/v1/health 200 4ms
// Only the method, path, status and time are logged: never bodies, cookies or query
// strings, so passwords and personal data never end up in the log.
'use strict';

function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  const path = req.path; // read now: Express shortens it while routing
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
}
module.exports = {
  requestLogger
};
