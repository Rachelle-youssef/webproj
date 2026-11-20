'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const notifications = require('./notifications.dal');
const { AuditEntryDTO } = require('../DTO/audit.dto');
const { CallDTO } = require('../DTO/community.dto');
const { NotFoundError, ConflictError } = require('../shared/errors');

async function findById(id) {
  const [row] = await db.query(
    'SELECT id, medicine_name, quantity, note, status, closed_at, created_at FROM medicine_calls WHERE id = ?',
    [id]
  );
  return row ? new CallDTO(row) : null;
}

async function list(filter, page) {
  const where = [],
    params = [];
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.medicine_name) {
    where.push('LOCATE(?, medicine_name) > 0');
    params.push(filter.medicine_name);
  }
  const result = await db.paged({
    columns: 'id, medicine_name, quantity, note, status, closed_at, created_at',
    from: 'FROM medicine_calls',
    where,
    params,
    order: db.orderBy(
      {
        created_at: 'created_at',
        quantity: 'quantity'
      },
      page,
      'id DESC'
    ),
    page
  });
  return {
    rows: result.rows.map((r) => new CallDTO(r)),
    total: result.total
  };
}

async function createMedicine(input, adminId, notification, auditEntry) {
  const result = await db.transaction(async (conn) => {
    const { insertId } = await db.query(
      'INSERT INTO medicine_calls (created_by, medicine_name, quantity, note) VALUES (?, ?, ?, ?)',
      [adminId, input.medicine_name, input.quantity, input.note],
      conn
    );
    const notified = await notifications.createForRole('donor', notification, conn);
    await audit.record(
      new AuditEntryDTO({
        ...auditEntry,
        entityId: insertId
      }),
      conn
    );
    return {
      id: insertId,
      notified
    };
  });
  return {
    call: await findById(result.id),
    notified: result.notified
  };
}

async function close(id, auditEntry) {
  await db.transaction(async (conn) => {
    const [call] = await db.query(
      'SELECT status FROM medicine_calls WHERE id = ? FOR UPDATE',
      [id],
      conn
    );
    if (!call) {
      throw new NotFoundError('Medicine call not found.');
    }
    if (call.status !== 'open') {
      throw new ConflictError('This call is already closed.');
    }
    await db.query(
      "UPDATE medicine_calls SET status = 'closed', closed_at = UTC_TIMESTAMP() WHERE id = ?",
      [id],
      conn
    );
    await audit.record(auditEntry, conn);
  });
  return findById(id);
}
// An appeal, donor alerts and audit event commit together. No donor-list limit.
async function createBlood(input, adminId, cutoff, notification, auditEntry) {
  return db.transaction(async (conn) => {
    const { insertId } = await db.query(
      `INSERT INTO blood_requests
      (requester_id, blood_type_id, units_needed, urgency, hospital_name, city, latitude, longitude, status, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, UTC_TIMESTAMP())`,
      [
        adminId,
        input.blood_type_id,
        input.units_needed,
        input.urgency,
        input.hospital_name,
        input.city,
        input.latitude,
        input.longitude,
        adminId
      ],
      conn
    );
    const result = await db.query(
      `INSERT INTO notifications (user_id, type, message, link)
      SELECT u.id, ?, ?, ? FROM users u JOIN roles r ON r.id = u.role_id
      JOIN donor_profiles dp ON dp.user_id = u.id
      JOIN blood_compatibility bc ON bc.donor_blood_type_id = dp.blood_type_id
      WHERE r.name = 'donor' AND u.is_active = TRUE AND dp.is_available = TRUE
        AND bc.recipient_blood_type_id = ? AND (dp.last_donation_date IS NULL OR dp.last_donation_date <= ?)`,
      [
        notification.type,
        notification.message,
        '#/blood-requests/' + insertId,
        input.blood_type_id,
        cutoff
      ],
      conn
    );
    await audit.record(
      new AuditEntryDTO({
        ...auditEntry,
        entityId: insertId
      }),
      conn
    );
    return {
      id: insertId,
      status: 'open',
      notified: result.affectedRows
    };
  });
}
module.exports = {
  findById,
  list,
  createMedicine,
  createBlood,
  close
};
