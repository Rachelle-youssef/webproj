// Non-destructive upgrade. Uses the MySQL administrator only for this schema change.
'use strict';

require('dotenv').config({
  quiet: true
});
const mysql = require('mysql2/promise');

async function main() {
  const name =
    (process.env.DB_NAME || 'lifelink') +
    (process.argv.includes('--test') ? '_test' : '');
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) {
    throw new Error('Invalid DB_NAME.');
  }
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_ROOT_USER || 'root',
    password: process.env.DB_ROOT_PASSWORD || '',
    database: name
  });
  try {
    const [columns] = await conn.execute(
      "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'blood_donations'",
      [name]
    );
    const status = columns.find((c) => c.COLUMN_NAME === 'status');
    if (!status) {
      throw new Error(
        'blood_donations table is missing. Run db:setup for a new database.'
      );
    }
    const changes = [];
    if (!status.COLUMN_TYPE.includes("'accepted'")) {
      changes.push(
        "MODIFY COLUMN status ENUM('invited','pending','completed','declined','cancelled','accepted') NOT NULL DEFAULT 'pending'"
      );
    }
    if (!columns.some((c) => c.COLUMN_NAME === 'accepted_at')) {
      changes.push('ADD COLUMN accepted_at DATETIME NULL');
    }
    if (changes.length) {
      await conn.query('ALTER TABLE blood_donations ' + changes.join(', '));
    }
    console.log(
      changes.length
        ? 'Acceptance upgrade applied. Existing rows, statuses and blood units preserved.'
        : 'Acceptance upgrade already applied; nothing changed.'
    );
  } finally {
    await conn.end();
  }
}
main().catch((err) => {
  console.error('Acceptance migration failed:', err.message);
  process.exitCode = 1;
});
