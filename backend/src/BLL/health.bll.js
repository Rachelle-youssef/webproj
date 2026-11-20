// BLL: the API is healthy when the database answers.
'use strict';

const healthDAL = require('../DAL/health.dal');
const { HealthDTO } = require('../DTO/common.dto');
const { version } = require('../../package.json');

async function check() {
  let database = 'up';
  try {
    await healthDAL.ping();
  } catch {
    database = 'down';
  }
  return new HealthDTO({
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    version,
    uptime_seconds: Math.round(process.uptime()),
    time: new Date().toISOString()
  });
}
module.exports = {
  check
};
