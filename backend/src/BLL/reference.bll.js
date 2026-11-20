// BLL: reference data for forms (no rules, passed through from the DAL).
'use strict';

const referenceDAL = require('../DAL/reference.dal');

async function bloodTypes() {
  return referenceDAL.bloodTypes();
}
module.exports = {
  bloodTypes
};
