// DAL for the health check.
'use strict';

const db = require('./db');

async function ping() {
  await db.ping();
}
module.exports = {
  ping
};
