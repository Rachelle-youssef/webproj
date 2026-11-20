// PL: receives the request, asks the BLL, returns the reply.
'use strict';

const healthBLL = require('../../BLL/health.bll');

async function getHealth(req, res) {
  const report = await healthBLL.check(); // a HealthDTO
  res.status(report.status === 'ok' ? 200 : 503).json({
    data: report
  });
}

module.exports = {
  getHealth
};
