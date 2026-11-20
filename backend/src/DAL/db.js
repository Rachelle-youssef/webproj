// DAL: the MySQL connection pool and the helpers every *.dal.js file uses.
// Nothing outside the DAL touches the pool, SQL or MySQL error codes.
'use strict';

const mysql = require('mysql2/promise');
const config = require('../config');
const {
  ConflictError,
  ValidationError,
  ServiceUnavailableError
} = require('../shared/errors');
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  timezone: 'Z',
  // DATETIME values are read and written as UTC
  dateStrings: ['DATE'],
  // DATE columns come back as 'YYYY-MM-DD' text, not a midnight timestamp
  decimalNumbers: true,
  // DECIMAL columns (coordinates) come back as numbers
  typeCast(field, next) {
    // BOOLEAN columns (TINYINT(1)) come back as true / false
    if (field.type === 'TINY' && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === '1';
    }
    return next();
  }
});

// Every new connection works in UTC, so DEFAULT CURRENT_TIMESTAMP is stored in UTC too.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

// MySQL refusals that mean "the data broke a rule", turned into business errors.
// (The API account gets the short ER_NO_REFERENCED_ROW code; an admin account gets _2.)
const REFUSALS = {
  ER_DUP_ENTRY: () => new ConflictError('This record already exists.'),
  ER_ROW_IS_REFERENCED: () => new ConflictError('This record is still in use.'),
  ER_ROW_IS_REFERENCED_2: () => new ConflictError('This record is still in use.'),
  ER_NO_REFERENCED_ROW: () => new ValidationError('A linked record does not exist.'),
  ER_NO_REFERENCED_ROW_2: () => new ValidationError('A linked record does not exist.'),
  ER_CHECK_CONSTRAINT_VIOLATED: () =>
    new ValidationError('A value is outside the allowed range.'),
  ER_DATA_OUT_OF_RANGE: () =>
    new ValidationError('A value is outside the allowed range.'),
  ER_DATA_TOO_LONG: () => new ValidationError('A value is too long.'),
  WARN_DATA_TRUNCATED: () =>
    new ValidationError('A value is not one of the allowed options.'),
  ER_TRUNCATED_WRONG_VALUE: () => new ValidationError('A value has the wrong format.')
};
// Errors that mean "the database cannot be reached right now".
const UNAVAILABLE = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_CON_COUNT_ERROR'
]);

function translate(err) {
  let translated = null;
  if (REFUSALS[err.code]) {
    translated = REFUSALS[err.code]();
  } else if (UNAVAILABLE.has(err.code)) {
    translated = new ServiceUnavailableError();
  }
  if (!translated) {
    return err;
  } // unexpected: the error handler logs it and answers 500
  translated.cause = err; // the original stays available for the server log
  return translated;
}

/**
 * Runs one statement as a real prepared statement: values are always sent
 * separately from the SQL text, never pasted into it.
 * @param {string} sql     statement with ? placeholders
 * @param {Array}  [params]
 * @param {object} [conn]  a connection inside transaction(); defaults to the pool
 */
async function query(sql, params = [], conn = pool) {
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } catch (err) {
    throw translate(err);
  }
}

/**
 * Runs several statements as one unit: all are saved, or none are.
 * Used only inside the DAL; the BLL never sees connections or transactions.
 */
async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Builds a safe ORDER BY: the public sort name must be in the allow-list,
 * so nothing typed by a user ever reaches the SQL text.
 * @param {Object<string,string>} sortColumns  public name -> SQL column
 * @param {import('../DTO/common.dto').PageRequestDTO} page
 * @param {string} tieBreak  extra columns that make the order stable, e.g. 'r.id DESC'
 */
function orderBy(sortColumns, page, tieBreak) {
  const column = sortColumns[page.sortField];
  if (!column) {
    throw new ValidationError('Invalid list options.', [
      {
        field: 'sort',
        message: 'is not a sortable field'
      }
    ]);
  }
  return `${column} ${page.sortDirection === 'DESC' ? 'DESC' : 'ASC'}, ${tieBreak}`;
}

/** Runs a COUNT and one page of a SELECT with the same FROM and WHERE. Returns { rows, total }. */
async function paged({ columns, from, where = [], params = [], order, page }) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
  const rows = await query(
    `SELECT ${columns} ${from} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, page.limit, (page.page - 1) * page.limit]
  );
  return {
    rows,
    total
  };
}

async function ping() {
  // Also verify that the non-destructive session-table upgrade was installed.
  await pool.query('SELECT 1 FROM sessions LIMIT 1');
  await pool.query('SELECT has_hospital_pin FROM blood_requests LIMIT 1');
}

async function close() {
  await pool.end();
}
module.exports = {
  query,
  transaction,
  orderBy,
  paged,
  ping,
  close
};
