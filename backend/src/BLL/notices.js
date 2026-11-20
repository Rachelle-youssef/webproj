// BLL: builds the alerts the BLL decides to send. Messages fit the 255-character column.
'use strict';

const { NotificationDTO } = require('../DTO/notification.dto');
const MAX_LENGTH = 255;

/** notice('sos', 'SOS: ...', '#/blood-requests/12', donorId) -> NotificationDTO */
function notice(type, message, link = null, userId = null) {
  const text =
    message.length > MAX_LENGTH ? `${message.slice(0, MAX_LENGTH - 1)}…` : message;
  return new NotificationDTO({
    userId,
    type,
    message: text,
    link
  });
}
module.exports = {
  notice
};
