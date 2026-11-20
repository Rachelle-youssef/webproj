// Creates the LifeLink database, its tables and reference data, and the
// MySQL account the API uses (it can read and write data, nothing more).
//
//   npm run db:setup        create everything; stops if the database already exists
//   npm run db:reset        delete the database and create it again (ALL DATA IS LOST)
//   npm run db:setup:test   the same for the separate test database (<DB_NAME>_test)
//   npm run db:reset:test   used by the automated tests, never touches your real data
'use strict';

require('dotenv').config({
  quiet: true
});
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const SCHEMA_FILE = path.join(__dirname, '..', 'database', 'schema.sql');
const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/; // safe database and user names
const HOST = /^[A-Za-z0-9.%:_-]{1,255}$/; // safe account host names

function readSettings() {
  const settings = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    rootUser: process.env.DB_ROOT_USER || 'root',
    rootPassword: process.env.DB_ROOT_PASSWORD || '',
    database:
      (process.env.DB_NAME || 'lifelink') +
      (process.argv.includes('--test') ? '_test' : ''),
    appUser: process.env.DB_USER || 'lifelink_app',
    appPassword: process.env.DB_PASSWORD || '',
    appHosts: (process.env.DB_APP_HOSTS || 'localhost,127.0.0.1')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
  };
  if (!IDENTIFIER.test(settings.database)) {
    throw new Error('DB_NAME may only contain letters, digits and underscores.');
  }
  if (!IDENTIFIER.test(settings.appUser)) {
    throw new Error('DB_USER may only contain letters, digits and underscores.');
  }
  if (settings.appUser === settings.rootUser) {
    throw new Error('DB_USER must be a separate account, not the administrator account.');
  }
  if (settings.appPassword.length < 12) {
    throw new Error('Set DB_PASSWORD in backend/.env to at least 12 characters.');
  }
  if (!settings.appHosts.length || !settings.appHosts.every((h) => HOST.test(h))) {
    throw new Error('DB_APP_HOSTS is not a valid list of hosts.');
  }
  return settings;
}

// schema.sql starts with CREATE DATABASE and USE so it also works in MySQL Workbench.
// Here the database name comes from .env, so those two statements are removed.
function loadSchema() {
  return fs
    .readFileSync(SCHEMA_FILE, 'utf8')
    .replace(/^\s*CREATE DATABASE[^;]*;/im, '')
    .replace(/^\s*USE[^;]*;/im, '');
}

async function databaseExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [name]
  );
  return rows.length > 0;
}

// The API's own account: it may read and change rows, but never drop tables or grant rights.
async function createAppAccount(conn, s) {
  for (const host of s.appHosts) {
    await conn.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [
      s.appUser,
      host,
      s.appPassword
    ]);
    await conn.query('ALTER USER ?@? IDENTIFIED BY ?', [s.appUser, host, s.appPassword]);
    await conn.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${mysql.escapeId(s.database)}.* TO ?@?`,
      [s.appUser, host]
    );
  }
}

async function summary(conn, name) {
  const [[counts]] = await conn.query(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?) AS tables_count,
       (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?) AS foreign_keys,
       (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?) AS checks`,
    [name, name, name]
  );
  return counts;
}

async function main() {
  const s = readSettings();
  const reset = process.argv.includes('--reset');
  let conn;
  try {
    conn = await mysql.createConnection({
      host: s.host,
      port: s.port,
      user: s.rootUser,
      password: s.rootPassword,
      multipleStatements: true
    });
  } catch (err) {
    throw new Error(
      `Could not connect to MySQL as "${s.rootUser}" (${err.code || err.message}).\n` +
        'Is MySQL running, and are DB_ROOT_USER and DB_ROOT_PASSWORD in backend/.env correct?'
    );
  }
  try {
    const db = mysql.escapeId(s.database);
    if (await databaseExists(conn, s.database)) {
      if (!reset) {
        console.log(`Database "${s.database}" already exists. Nothing was changed.`);
        console.log(
          'To delete it and start again (all data is lost), run: npm run db:reset'
        );
        return;
      }
      await conn.query(`DROP DATABASE ${db}`);
      console.log(`Deleted database "${s.database}".`);
    }
    await conn.query(`CREATE DATABASE ${db} CHARACTER SET utf8mb4`);
    await conn.query(`USE ${db}`);
    await conn.query(loadSchema());
    await createAppAccount(conn, s);
    const c = await summary(conn, s.database);
    console.log(
      `Database "${s.database}" is ready: ${c.tables_count} tables, ${c.foreign_keys} foreign keys, ${c.checks} check constraints.`
    );
    console.log(
      `The API will connect as "${s.appUser}" (read and write rows only, from: ${s.appHosts.join(', ')}).`
    );
  } finally {
    await conn.end();
  }
}
main().catch((err) => {
  console.error(`Database setup failed: ${err.message}`);
  process.exitCode = 1;
});
