// DAL: all SQL about users and donor profiles. Returns DTOs, never raw rows.
'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const { ValidationError } = require('../shared/errors');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { UserDTO, CredentialsDTO, SessionUserDTO } = require('../DTO/user.dto');
const PUBLIC_COLUMNS = `
  u.id, u.full_name, u.email, r.name AS role, u.phone, u.city, u.latitude, u.longitude,
  u.is_active, u.created_at,
  dp.blood_type_id, bt.label AS blood_type, dp.last_donation_date, dp.is_available`;
const FROM_USERS = `
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN donor_profiles dp ON dp.user_id = u.id
  LEFT JOIN blood_types bt ON bt.id = dp.blood_type_id`;

// Public sort names -> SQL columns. Anything else is refused, so ORDER BY can never be injected.
const SORT_COLUMNS = {
  created_at: 'u.created_at',
  full_name: 'u.full_name',
  email: 'u.email'
};

async function findCredentialsByEmail(email) {
  const [row] = await db.query(
    `SELECT u.id, u.full_name, r.name AS role, u.password_hash, u.is_active, u.session_version
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [email]
  );
  return row ? new CredentialsDTO(row) : null;
}

async function findSessionUser(id) {
  const [row] = await db.query(
    `SELECT u.id, u.full_name, r.name AS role, u.is_active, u.session_version
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [id]
  );
  return row ? new SessionUserDTO(row) : null;
}

async function findPasswordHash(id) {
  const [row] = await db.query('SELECT password_hash FROM users WHERE id = ?', [id]);
  return row ? row.password_hash : null;
}

async function findById(id, conn) {
  const [row] = await db.query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS} WHERE u.id = ?`,
    [id],
    conn
  );
  return row ? new UserDTO(row) : null;
}

async function emailExists(email) {
  const [row] = await db.query('SELECT 1 AS found FROM users WHERE email = ?', [email]);
  return Boolean(row);
}

/**
 * Creates the user, their donor profile (donors only) and, if given, an audit entry
 * in one transaction: all of it is saved, or none of it.
 * @param {import('../DTO/user.dto').RegisterDTO} account
 * @param {string} passwordHash
 * @param {AuditEntryDTO} [auditEntry]  the new user's id is filled in here
 */
async function createAccount(account, passwordHash, auditEntry) {
  return db.transaction(async (conn) => {
    const { insertId: id } = await db.query(
      `INSERT INTO users (role_id, full_name, email, password_hash, phone, city, latitude, longitude)
       VALUES ((SELECT id FROM roles WHERE name = ?), ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.role,
        account.full_name,
        account.email,
        passwordHash,
        account.phone,
        account.city,
        account.latitude,
        account.longitude
      ],
      conn
    );
    if (account.role === 'donor') {
      await db.query(
        'INSERT INTO donor_profiles (user_id, blood_type_id) VALUES (?, ?)',
        [id, account.blood_type_id],
        conn
      );
    }
    if (auditEntry) {
      await audit.record(
        new AuditEntryDTO({
          ...auditEntry,
          userId: id,
          entityId: id
        }),
        conn
      );
    }
    return findById(id, conn);
  });
}
const USER_COLUMNS = ['full_name', 'phone', 'city', 'latitude', 'longitude'];

/** @param {import('../DTO/user.dto').ProfileUpdateDTO} changes */
async function updateProfile(id, changes) {
  await db.transaction(async (conn) => {
    const fields = USER_COLUMNS.filter((f) => Object.hasOwn(changes, f));
    if (fields.length) {
      await db.query(
        `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((f) => changes[f]), id],
        conn
      );
    }
    if (Object.hasOwn(changes, 'is_available')) {
      await db.query(
        'UPDATE donor_profiles SET is_available = ? WHERE user_id = ?',
        [changes.is_available, id],
        conn
      );
    }
  });
  return findById(id);
}

/** Saves the new hash and ends every existing session; returns the new session version. */
async function updatePassword(id, passwordHash) {
  return db.transaction(async (conn) => {
    await db.query(
      'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
      [passwordHash, id],
      conn
    );
    await db.query('DELETE FROM sessions WHERE user_id = ?', [id], conn);
    const [row] = await db.query(
      'SELECT session_version FROM users WHERE id = ?',
      [id],
      conn
    );
    return row.session_version;
  });
}

async function setActive(id, isActive) {
  await db.transaction(async (conn) => {
    await db.query(
      'UPDATE users SET is_active = ?, session_version = session_version + ? WHERE id = ?',
      [isActive, isActive ? 0 : 1, id],
      conn
    );
    if (!isActive) await db.query('DELETE FROM sessions WHERE user_id = ?', [id], conn);
  });
}

/**
 * @param {import('../DTO/user.dto').UserFilterDTO} filter
 * @param {import('../DTO/common.dto').PageRequestDTO} page
 * @returns {Promise<{ rows: UserDTO[], total: number }>}
 */
async function list(filter, page) {
  const column = SORT_COLUMNS[page.sortField];
  const direction = page.sortDirection === 'DESC' ? 'DESC' : 'ASC';
  if (!column) {
    throw new ValidationError('Invalid list options.', [
      {
        field: 'sort',
        message: 'is not a sortable field'
      }
    ]);
  }
  const where = [];
  const params = [];
  if (filter.role) {
    where.push('r.name = ?');
    params.push(filter.role);
  }
  if (filter.isActive !== null) {
    where.push('u.is_active = ?');
    params.push(filter.isActive);
  }
  if (filter.q) {
    const pattern = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`; // a typed % or _ is searched for literally
    where.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(pattern, pattern);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await db.query(
    `SELECT COUNT(*) AS total ${FROM_USERS} ${whereSql}`,
    params
  );
  const rows = await db.query(
    `SELECT ${PUBLIC_COLUMNS} ${FROM_USERS} ${whereSql} ORDER BY ${column} ${direction}, u.id DESC LIMIT ? OFFSET ?`,
    [...params, page.limit, (page.page - 1) * page.limit]
  );
  return {
    rows: rows.map((r) => new UserDTO(r)),
    total
  };
}
module.exports = {
  findCredentialsByEmail,
  findSessionUser,
  findPasswordHash,
  findById,
  emailExists,
  createAccount,
  updateProfile,
  updatePassword,
  setActive,
  list
};
