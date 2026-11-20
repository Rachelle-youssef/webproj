'use strict';

class CallInputDTO {
  constructor({ medicine_name, quantity, note = null }) {
    this.medicine_name = medicine_name;
    this.quantity = quantity;
    this.note = note;
  }
}

class CommunityFilterDTO {
  constructor({ status, medicine_name, is_read, type, kind, action, entity, user_id }) {
    this.status = status;
    this.medicine_name = medicine_name;
    this.is_read = is_read;
    this.type = type;
    this.kind = kind;
    this.action = action;
    this.entity = entity;
    this.user_id = user_id;
  }
}

class CallDTO {
  constructor({ id, medicine_name, quantity, note, status, closed_at, created_at }) {
    this.id = id;
    this.medicine_name = medicine_name;
    this.quantity = quantity;
    this.note = note;
    this.status = status;
    this.closed_at = closed_at;
    this.created_at = created_at;
  }
}

class NotificationViewDTO {
  constructor({ id, type, message, link, is_read, created_at }) {
    this.id = id;
    this.type = type;
    this.message = message;
    this.link = link;
    this.is_read = is_read;
    this.created_at = created_at;
  }
}

class FeedItemDTO {
  constructor({ id, kind, title, quantity, at, city }) {
    this.id = id;
    this.kind = kind;
    this.title = title;
    this.quantity = quantity;
    this.at = at;
    this.city = city;
  }
}

class AuditViewDTO {
  constructor({ id, user_id, action, entity, entity_id, ip_address, created_at }) {
    this.id = id;
    this.user_id = user_id;
    this.action = action;
    this.entity = entity;
    this.entity_id = entity_id;
    this.ip_address = ip_address;
    this.created_at = created_at;
  }
}

module.exports = {
  CallInputDTO,
  CommunityFilterDTO,
  CallDTO,
  NotificationViewDTO,
  FeedItemDTO,
  AuditViewDTO
};
