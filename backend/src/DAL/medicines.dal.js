'use strict';

const db = require('./db');
const audit = require('./audit.dal');
const notifications = require('./notifications.dal');
const { ValidationError, ConflictError, NotFoundError } = require('../shared/errors');

function categories() {
  return db.query('SELECT id, name FROM medicine_categories ORDER BY id');
}

async function list(donorId, status, page) {
  const where = [],
    params = [];
  if (donorId !== null) {
    where.push('donor_id = ?');
    params.push(donorId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  return db.paged({
    columns: '*',
    from: 'FROM medicines',
    where,
    params,
    order: db.orderBy(
      {
        created_at: 'created_at'
      },
      page,
      'id DESC'
    ),
    page
  });
}

async function submit(donorId, input, notice) {
  return db.transaction(async (conn) => {
    const [category] = await db.query(
      'SELECT id FROM medicine_categories WHERE id = ?',
      [input.category_id],
      conn
    );
    if (!category) {
      throw new ValidationError('Unknown medicine category.');
    }
    if (input.call_id != null) {
      const [call] = await db.query(
        'SELECT status FROM medicine_calls WHERE id = ? FOR UPDATE',
        [input.call_id],
        conn
      );
      if (!call) {
        throw new NotFoundError('Medicine call not found.');
      }
      if (call.status !== 'open') {
        throw new ConflictError('This medicine call is closed.');
      }
    }
    const { insertId } = await db.query(
      'INSERT INTO medicines (donor_id, category_id, call_id, name, description, quantity_donated, quantity_available, expiry_date, photo_url) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [
        donorId,
        input.category_id,
        input.call_id ?? null,
        input.name,
        input.description ?? null,
        input.quantity_donated,
        input.expiry_date,
        input.photo_url ?? null
      ],
      conn
    );
    await notifications.createForRole('admin', notice, conn);
    const [row] = await db.query(
      'SELECT * FROM medicines WHERE id = ?',
      [insertId],
      conn
    );
    return row;
  });
}

async function review(id, adminId, status, note, date, notice, entry) {
  return db.transaction(async (conn) => {
    const [current] = await db.query(
      'SELECT * FROM medicines WHERE id = ? FOR UPDATE',
      [id],
      conn
    );
    if (!current) {
      throw new NotFoundError('Medicine donation not found.');
    }
    if (current.status !== 'pending') {
      throw new ConflictError('This donation has already been reviewed.');
    }
    if (status === 'approved' && current.expiry_date <= date) {
      throw new ConflictError('This donation has expired.');
    }
    const available = status === 'approved' ? current.quantity_donated : 0;
    await db.query(
      'UPDATE medicines SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP(), quantity_available = ? WHERE id = ?',
      [status, note, adminId, available, id],
      conn
    );
    await notifications.create(
      [
        {
          ...notice,
          userId: current.donor_id
        }
      ],
      conn
    );
    await audit.record(entry, conn);
    const [row] = await db.query('SELECT * FROM medicines WHERE id = ?', [id], conn);
    return row;
  });
}

async function findById(id) {
  const [row] = await db.query('SELECT * FROM medicines WHERE id = ?', [id]);
  return row;
}
module.exports = {
  categories,
  list,
  submit,
  review,
  findById
};
