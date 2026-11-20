// BLL -> DAL: one alert to store for a user (userId is null when it goes to a whole role).
'use strict';

class NotificationDTO {
  constructor({ userId = null, type, message, link = null }) {
    this.userId = userId;
    this.type = type;
    this.message = message;
    this.link = link;
  }
}

module.exports = {
  NotificationDTO
};
