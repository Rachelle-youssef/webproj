// BLL: password hashing with Argon2id, built into Node.js since version 24.7.
// Settings follow the OWASP Password Storage Cheat Sheet: 19 MiB memory, 2 passes, 1 lane.
//
// A stored hash looks like (standard "PHC" format, safe to keep in the database):
//   $argon2id$v=19$m=19456,t=2,p=1$<salt in base64>$<hash in base64>
// The settings are saved inside the string, so they can be raised later
// without breaking the passwords that already exist.
'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
if (typeof crypto.argon2 !== 'function') {
  throw new Error(
    `LifeLink needs Node.js 24.7 or later for Argon2 password hashing (you have ${process.version}).`
  );
}
const argon2 = promisify(crypto.argon2);
const SETTINGS = {
  memory: 19456,
  passes: 2,
  parallelism: 1
}; // memory is in KiB
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
const b64 = (buf) => buf.toString('base64').replace(/=+$/, '');

async function derive(password, salt, { memory, passes, parallelism }, tagLength) {
  return argon2('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    memory,
    passes,
    parallelism,
    tagLength
  });
}

/** Turns a password into a salted Argon2id hash string. */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, SETTINGS, HASH_BYTES);
  const { memory: m, passes: t, parallelism: p } = SETTINGS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(hash)}`;
}

/** True only if the password matches the stored hash. Compares in constant time. */
async function verifyPassword(password, stored) {
  const parts = PHC.exec(stored || '');
  if (!parts) {
    return false;
  }
  const [, m, t, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  try {
    const actual = await derive(
      password,
      Buffer.from(saltB64, 'base64'),
      {
        memory: Number(m),
        passes: Number(t),
        parallelism: Number(p)
      },
      expected.length
    );
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false; // settings Argon2 cannot use mean the stored value is damaged
  }
}

// Used when an email is unknown, so a login takes the same time whether the account
// exists or not. Otherwise an attacker could learn which emails are registered.
let dummyHash;

async function burnTime(password) {
  dummyHash ??= await hashPassword('lifelink-dummy-password');
  await verifyPassword(password, dummyHash);
}
module.exports = {
  hashPassword,
  verifyPassword,
  burnTime
};
