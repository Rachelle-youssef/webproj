// PL: reference data for forms.
'use strict';

const referenceBLL = require('../../BLL/reference.bll');
const { ok } = require('../respond');
async function bloodTypes(req, res) {
  const result = await referenceBLL.bloodTypes();
  ok(res, result);
}

module.exports = {
  bloodTypes
};
