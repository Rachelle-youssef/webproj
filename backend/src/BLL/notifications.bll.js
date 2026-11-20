'use strict';

const notificationsDAL = require('../DAL/notifications.dal');
const { PageDTO } = require('../DTO/common.dto');
const { NotFoundError } = require('../shared/errors');

async function list(user, filter, page) {
  const result = await notificationsDAL.list(user.id, filter, page);
  return new PageDTO(result.rows, page, result.total);
}

async function markRead(user, id) {
  if (!(await notificationsDAL.markRead(user.id, id))) {
    throw new NotFoundError('Notification not found.');
  }
}
module.exports = {
  list,
  markRead,
  unreadCount: (user) => notificationsDAL.unreadCount(user.id),
  readAll: (user) => notificationsDAL.readAll(user.id)
};
