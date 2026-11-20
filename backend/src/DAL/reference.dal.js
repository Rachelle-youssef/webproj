// DAL: fixed reference data the interface needs (blood types).
'use strict';

const db = require('./db');
const { BloodTypeDTO } = require('../DTO/blood.dto');

async function bloodTypes() {
  const rows = await db.query('SELECT id, label FROM blood_types ORDER BY id');
  return rows.map((r) => new BloodTypeDTO(r));
}
module.exports = {
  bloodTypes
};
