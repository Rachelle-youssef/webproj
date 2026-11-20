// DAL: notification storage and owner-scoped reading.
'use strict';

const db = require('./db');
const CHUNK = 200; // rows per INSERT, so one statement never gets too large

/** @param {import('../DTO/notification.dto').NotificationDTO[]} notifications  @param {object} [conn] */
async function create(notifications, conn) {
  for (let i = 0; i < notifications.length; i += CHUNK) {
    const chunk = notifications.slice(i, i + CHUNK);
    await db.query(
      `INSERT INTO notifications (user_id, type, message, link) VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}`,
      chunk.flatMap((n) => [n.userId, n.type, n.message, n.link]),
      conn
    );
  }
}

/** Sends the same alert to every active user with a role, e.g. all admins. */
async function createForRole(role, notification, conn) {
  const result = await db.query(
    `INSERT INTO notifications (user_id, type, message, link)
     SELECT u.id, ?, ?, ? FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ? AND u.is_active = TRUE`,
    [notification.type, notification.message, notification.link, role],
    conn
  );
  return result.affectedRows;
}

async function list(userId, filter, page) {
  const { NotificationViewDTO } = require('../DTO/community.dto');
  const where = ['user_id = ?'],
    params = [userId];
  if (filter.is_read !== undefined) {
    where.push('is_read = ?');
    params.push(filter.is_read);
  }
  if (filter.type) {
    where.push('type = ?');
    params.push(filter.type);
  }
  const result = await db.paged({
    columns: 'id, type, message, link, is_read, created_at',
    from: 'FROM notifications',
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
  return {
    rows: result.rows.map((r) => new NotificationViewDTO(r)),
    total: result.total
  };
}

async function unreadCount(userId) {
  const [row] = await db.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return row;
}

async function markRead(userId, id) {
  const [row] = await db.query(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  if (!row) {
    return false;
  }
  await db.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [
    id,
    userId
  ]);
  return true;
}

async function readAll(userId) {
  const result = await db.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return {
    updated: result.affectedRows
  };
}
module.exports = {
  create,
  createForRole,
  list,
  unreadCount,
  markRead,
  readAll
};
