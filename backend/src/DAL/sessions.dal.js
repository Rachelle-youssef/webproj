// DAL: persistent sessions. Only a SHA-256 digest of each random session ID is stored.
'use strict';
const db = require('./db');
const { SessionRecordDTO } = require('../DTO/session.dto');
const { UnauthenticatedError } = require('../shared/errors');

async function find(idHash) {
  const [row] = await db.query(
    'SELECT data FROM sessions WHERE id_hash = ? AND expires_at > UTC_TIMESTAMP(3)',
    [idHash]
  );
  return row ? new SessionRecordDTO(JSON.parse(row.data)) : null;
}

async function save(idHash, data) {
  // Clean expired rows on sign-in. The expiry index keeps this inexpensive.
  await db.query('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
  const serialized = JSON.stringify(data);
  const result = await db.query(
    `INSERT INTO sessions (id_hash, user_id, session_version, expires_at, data)
     SELECT ?, id, session_version, ?, ? FROM users
     WHERE id = ? AND is_active = TRUE AND session_version = ?
     ON DUPLICATE KEY UPDATE data = ?`,
    [
      idHash,
      new Date(data.expiresAt),
      serialized,
      data.userId,
      data.sessionVersion,
      serialized
    ]
  );
  if (!result.affectedRows) throw new UnauthenticatedError('Please log in again.');
}

async function remove(idHash) {
  await db.query('DELETE FROM sessions WHERE id_hash = ?', [idHash]);
}
module.exports = { find, save, remove };
