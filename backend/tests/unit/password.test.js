'use strict';

const { hashPassword, verifyPassword } = require('../../src/BLL/password');
describe('password hashing (Argon2id)', () => {
  test('stores a salted hash in PHC format, never the password', async () => {
    const hash = await hashPassword('Correct horse 1');
    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/
    );
    expect(hash).not.toContain('Correct horse 1');
  });
  test('the same password gives a different hash each time (random salt)', async () => {
    expect(await hashPassword('same-password')).not.toBe(
      await hashPassword('same-password')
    );
  });
  test('accepts the right password and refuses a wrong one', async () => {
    const hash = await hashPassword('Correct horse 1');
    expect(await verifyPassword('Correct horse 1', hash)).toBe(true);
    expect(await verifyPassword('correct horse 1', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });
  test('handles Arabic and emoji passwords', async () => {
    const hash = await hashPassword('كلمة السر ❤️ 2026');
    expect(await verifyPassword('كلمة السر ❤️ 2026', hash)).toBe(true);
  });
  test('refuses anything that is not a valid stored hash', async () => {
    for (const bad of [
      '',
      null,
      'plain',
      '$2a$10$bcryptstylehashvalue',
      '$argon2id$v=19$m=1,t=1,p=1$AAAA$BBBB'
    ]) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});
