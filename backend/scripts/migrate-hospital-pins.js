'use strict';
require('dotenv').config({ quiet: true });
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
    const [rows] = await conn.execute(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'blood_requests' AND COLUMN_NAME = 'has_hospital_pin'",
      [database]
    );
    if (!rows.length)
      await conn.query(
        'ALTER TABLE blood_requests ADD COLUMN has_hospital_pin BOOLEAN NOT NULL DEFAULT FALSE'
      );
    console.log(
      'Hospital pin upgrade is ready. Existing accounts and requests were preserved. Legacy patient coordinates stay private until a hospital pin is explicitly selected.'
    );
  } finally {
    await conn.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
