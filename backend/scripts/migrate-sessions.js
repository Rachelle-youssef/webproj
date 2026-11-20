// Adds only the sessions table. Safe to run again; never resets existing data.
'use strict';
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
async function main() {
  const database =
    (process.env.DB_NAME || 'lifelink') +
    (process.argv.includes('--test') ? '_test' : '');
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database)) throw new Error('Invalid DB_NAME.');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_ROOT_USER || 'root',
    password: process.env.DB_ROOT_PASSWORD || '',
    database
  });
  try {
    await conn.query(
      fs.readFileSync(path.join(__dirname, '../database/sessions.sql'), 'utf8')
    );
    console.log(
      'Sessions table is ready. Existing accounts, passwords and donations were preserved.'
    );
  } finally {
    await conn.end();
  }
}
main().catch((err) => {
  console.error('Session migration failed:', err.message);
  process.exitCode = 1;
});
