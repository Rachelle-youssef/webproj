'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const notifications = require('./notifications.dal');
const { ConflictError, NotFoundError } = require('../shared/errors');

function available(date, page) {
  return db.paged({
    columns:
      'id, category_id, name, description, quantity_available, expiry_date, photo_url',
    from: 'FROM medicines',
    where: ["status = 'approved'", 'quantity_available > 0', 'expiry_date > ?'],
    params: [date],
    order: db.orderBy(
      {
        expiry_date: 'expiry_date'
      },
      page,
      'id ASC'
    ),
    page
  });
}

function list(requesterId, status, page) {
  const where = [],
    params = [];
  if (requesterId !== null) {
    where.push('r.requester_id = ?');
    params.push(requesterId);
  }
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  return db.paged({
    columns: 'r.*, m.name AS medicine_name',
    from: 'FROM medicine_requests r JOIN medicines m ON m.id = r.medicine_id',
    where,
    params,
    order: db.orderBy(
      {
        created_at: 'r.created_at'
      },
      page,
      'r.id DESC'
    ),
    page
  });
}

async function lockAvailableBatch(id, quantity, date, conn) {
  const [batch] = await db.query(
    'SELECT status, quantity_available, expiry_date FROM medicines WHERE id = ? FOR UPDATE',
    [id],
    conn
  );
  if (!batch) {
    throw new NotFoundError('Medicine batch not found.');
  }
  if (
    batch.status !== 'approved' ||
    batch.expiry_date <= date ||
    batch.quantity_available < quantity
  ) {
    throw new ConflictError('The requested quantity is unavailable for this batch.');
  }
  return batch;
}

function submit(requesterId, input, date, notice) {
  return db.transaction(async (conn) => {
    await lockAvailableBatch(input.medicine_id, input.quantity, date, conn);
    const { insertId } = await db.query(
      'INSERT INTO medicine_requests (requester_id, medicine_id, quantity) VALUES (?, ?, ?)',
      [requesterId, input.medicine_id, input.quantity],
      conn
    );
    await notifications.createForRole('admin', notice, conn);
    const [row] = await db.query(
      'SELECT * FROM medicine_requests WHERE id = ?',
      [insertId],
      conn
    );
    return row;
  });
}

function dispense(id, adminId, date, notice, entry) {
  return db.transaction(async (conn) => {
    const [request] = await db.query(
      'SELECT * FROM medicine_requests WHERE id = ? FOR UPDATE',
      [id],
      conn
    );
    if (!request) {
      throw new NotFoundError('Medicine request not found.');
    }
    if (request.status !== 'pending') {
      throw new ConflictError('Only pending medicine requests can be dispensed.');
    }
    const batch = await lockAvailableBatch(
      request.medicine_id,
      request.quantity,
      date,
      conn
    );
    const remaining = batch.quantity_available - request.quantity;
    const status = remaining === 0 ? 'dispensed' : 'approved';
    await db.query(
      'UPDATE medicines SET quantity_available = ?, status = ? WHERE id = ?',
      [remaining, status, request.medicine_id],
      conn
    );
    await db.query(
      "UPDATE medicine_requests SET status = 'approved', reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?",
      [adminId, id],
      conn
    );
    await notifications.create(
      [
        {
          ...notice,
          userId: request.requester_id
        }
      ],
      conn
    );
    await audit.record(entry, conn);
    const [updated] = await db.query(
      'SELECT * FROM medicine_requests WHERE id = ?',
      [id],
      conn
    );
    return {
      ...updated,
      quantity_available: remaining
    };
  });
}
module.exports = {
  available,
  list,
  submit,
  dispense
};
