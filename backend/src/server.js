// Starts the API: checks the database first, then listens for requests.
// Ctrl+C (or a stop signal) closes open connections cleanly.
'use strict';

require('./shared/checkNode');
let config;
try {
  config = require('./config'); // stops here, with a readable list, if .env has a problem
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const db = require('./DAL/db'); // server.js wires the layers together: start-up check and shutdown only
const { createApp } = require('./app');

async function start() {
  try {
    await db.ping();
  } catch (err) {
    console.error(`Cannot reach MySQL (${err.code || err.message}).`);
    console.error(
      'Is MySQL running? Did you run "npm run db:setup"? Are DB_USER and DB_PASSWORD in backend/.env correct?'
    );
    console.error(
      'For an existing Step 11 database, also run "npm run db:migrate:sessions".'
    );
    console.error(
      'For the hospital-location upgrade, run "npm run db:migrate:hospital-pins".'
    );
    process.exit(1);
  }
  const server = createApp().listen(config.port, (err) => {
    if (err) {
      console.error(
        err.code === 'EADDRINUSE'
          ? `Port ${config.port} is already in use. Change PORT in backend/.env.`
          : err.message
      );
      process.exit(1);
    }
    console.log(
      `LifeLink running on http://localhost:${config.port}  (API docs: http://localhost:${config.port}/api/docs)`
    );
  });
  const stop = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref(); // force-quit if something hangs
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
start();
