// Checks the schema from Step 1 against the test database, using the API's own
// limited account, and checks that the DAL turns MySQL refusals into business errors.
// Every change happens inside a transaction that is rolled back.
'use strict';

const db = require('../src/DAL/db');
afterAll(() => db.close());
class Rollback extends Error {}

async function inRolledBackTransaction(work) {
  await expect(
    db.transaction(async (conn) => {
      await work(conn);
      throw new Rollback();
    })
  ).rejects.toBeInstanceOf(Rollback);
}
describe('reference data', () => {
  test('has the expected rows', async () => {
    const [counts] = await db.query(`SELECT
      (SELECT COUNT(*) FROM roles) AS roles, (SELECT COUNT(*) FROM blood_types) AS blood_types,
      (SELECT COUNT(*) FROM blood_compatibility) AS pairs, (SELECT COUNT(*) FROM blood_stock) AS stock_rows,
      (SELECT COUNT(*) FROM medicine_categories) AS categories`);
    expect(counts).toEqual({
      roles: 4,
      blood_types: 8,
      pairs: 27,
      stock_rows: 8,
      categories: 7
    });
  });
  test('blood compatibility follows the ABO/Rh rule', async () => {
    const types = await db.query('SELECT id, label FROM blood_types');
    const antigens = (label) => [
      ...(label.includes('A') ? ['A'] : []),
      ...(label.includes('B') ? ['B'] : []),
      ...(label.endsWith('+') ? ['Rh'] : [])
    ];
    const expected = [];
    for (const d of types)
      for (const r of types) {
        if (antigens(d.label).every((a) => antigens(r.label).includes(a)))
          expected.push(`${d.label}>${r.label}`);
      }
    const rows =
      await db.query(`SELECT d.label AS donor, r.label AS recipient FROM blood_compatibility c
      JOIN blood_types d ON d.id = c.donor_blood_type_id JOIN blood_types r ON r.id = c.recipient_blood_type_id`);
    expect(rows.map((x) => `${x.donor}>${x.recipient}`).sort()).toEqual(expected.sort());
  });
});
describe('the database rejects bad data, and the DAL reports it as a business error', () => {
  test('a latitude outside -90..90', () =>
    inRolledBackTransaction(async (conn) => {
      await expect(
        db.query(
          "INSERT INTO users (role_id, full_name, email, password_hash, latitude, longitude) VALUES (1, 'X', 'x@test.lb', 'h', 95, 35)",
          [],
          conn
        )
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        cause: {
          code: 'ER_CHECK_CONSTRAINT_VIOLATED'
        }
      });
    }));
  test('a link to a record that does not exist', () =>
    inRolledBackTransaction(async (conn) => {
      await expect(
        db.query(
          'INSERT INTO blood_donations (donor_id, request_id) VALUES (999999, 999999)',
          [],
          conn
        )
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        cause: {
          code: 'ER_NO_REFERENCED_ROW'
        }
      });
    }));
  test('blood stock below zero', () =>
    inRolledBackTransaction(async (conn) => {
      // Other test files may leave positive stock. Establish this test's own baseline.
      await db.query(
        'UPDATE blood_stock SET units_available = 0 WHERE blood_type_id = 1',
        [],
        conn
      );
      await expect(
        db.query(
          'UPDATE blood_stock SET units_available = units_available - 1 WHERE blood_type_id = 1',
          [],
          conn
        )
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        cause: {
          code: 'ER_DATA_OUT_OF_RANGE'
        }
      });
    }));
});
describe('data types come back in API-friendly form', () => {
  test('booleans, dates, coordinates and UTC times', () =>
    inRolledBackTransaction(async (conn) => {
      const user = await db.query(
        "INSERT INTO users (role_id, full_name, email, password_hash, city, latitude, longitude) VALUES (1, 'Maya', 'maya@test.lb', 'h', 'Beirut', 33.893791, 35.501778)",
        [],
        conn
      );
      await db.query(
        'INSERT INTO donor_profiles (user_id, blood_type_id, last_donation_date) VALUES (?, 8, ?)',
        [user.insertId, '2026-08-01'],
        conn
      );
      const [row] = await db.query(
        `SELECT u.is_active, u.latitude, u.created_at, d.last_donation_date
      FROM users u JOIN donor_profiles d ON d.user_id = u.id WHERE u.id = ?`,
        [user.insertId],
        conn
      );
      expect(row.is_active).toBe(true);
      expect(row.latitude).toBe(33.893791);
      expect(row.last_donation_date).toBe('2026-08-01');
      expect(row.created_at).toBeInstanceOf(Date);
      expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(60_000); // stored in UTC, read back as the right moment
    }));
});
describe('transactions', () => {
  test('undo every change when something fails', async () => {
    await inRolledBackTransaction(async (conn) => {
      await db.query(
        "INSERT INTO users (role_id, full_name, email, password_hash) VALUES (1, 'Temp', 'temp@test.lb', 'h')",
        [],
        conn
      );
    });
    const rows = await db.query("SELECT id FROM users WHERE email = 'temp@test.lb'");
    expect(rows).toHaveLength(0);
  });
});
describe('duplicates', () => {
  test('become a CONFLICT error', () =>
    inRolledBackTransaction(async (conn) => {
      await db.query(
        "INSERT INTO users (role_id, full_name, email, password_hash) VALUES (1, 'A', 'dup@test.lb', 'h')",
        [],
        conn
      );
      await expect(
        db.query(
          "INSERT INTO users (role_id, full_name, email, password_hash) VALUES (1, 'B', 'dup@test.lb', 'h')",
          [],
          conn
        )
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        cause: {
          code: 'ER_DUP_ENTRY'
        }
      });
    }));
});
describe('least privilege', () => {
  test('the API account cannot drop or alter tables', async () => {
    await expect(db.query('DROP TABLE notifications')).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR'
    });
    await expect(
      db.query('ALTER TABLE users ADD COLUMN hacked INT')
    ).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR'
    });
  });
});
