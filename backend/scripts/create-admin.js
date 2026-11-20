// Creates the first admin account from ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env.
// Admins cannot sign up through the website, so this is the only way to make one.
//   npm run admin:create
// Afterwards, delete ADMIN_PASSWORD from .env: it is only needed once.
'use strict';

require('../src/shared/checkNode');
require('dotenv').config({
  quiet: true
});
const authBLL = require('../src/BLL/auth.bll');
const db = require('../src/DAL/db');
const { RegisterDTO } = require('../src/DTO/user.dto');
const { ConflictError } = require('../src/shared/errors');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set ADMIN_EMAIL in backend/.env to a valid email address.');
  }
  const password = process.env.ADMIN_PASSWORD || '';
  if (password.length > 128) {
    throw new Error('ADMIN_PASSWORD may be at most 128 characters.');
  }
  try {
    const admin = await authBLL.createAdmin(
      new RegisterDTO({
        role: 'admin',
        full_name: (process.env.ADMIN_NAME || 'LifeLink Admin').trim(),
        email,
        password
      })
    );
    console.log(`Admin account created (id ${admin.id}): ${admin.email}`);
    console.log('You can now delete ADMIN_PASSWORD from backend/.env.');
  } catch (err) {
    if (err instanceof ConflictError) {
      console.log(`${err.message} Nothing was changed.`);
    } else {
      throw err;
    }
  }
}
main()
  .catch((err) => {
    console.error(`Could not create the admin: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
