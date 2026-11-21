// PL: reference data for forms.
'use strict';

const referenceBLL = require('../../BLL/reference.bll');
const locationsBLL = require('../../BLL/locations.bll');
const { HospitalSearchDTO } = require('../../DTO/location.dto');
const { ok } = require('../respond');
async function bloodTypes(req, res) {
  const result = await referenceBLL.bloodTypes();
  ok(res, result);
}

async function hospitalLocations(req, res) {
  const input = new HospitalSearchDTO(req.valid);
  const results = await locationsBLL.search(input);
  ok(res, results);
}

module.exports = {
  bloodTypes,
  hospitalLocations
};
