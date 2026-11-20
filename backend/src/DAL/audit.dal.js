// DAL: writes security events (sign-ins, admin decisions...) to audit_logs.
'use strict';

const db = require('./db');

/** @param {import('../DTO/audit.dto').AuditEntryDTO} entry  @param {object} [conn] */
async function record(entry, conn) {
  await db.query(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip_address) VALUES (?, ?, ?, ?, ?)',
    [
      entry.userId,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.ip ? String(entry.ip).slice(0, 45) : null
    ],
    conn
  );
}
module.exports = {
  record
};
