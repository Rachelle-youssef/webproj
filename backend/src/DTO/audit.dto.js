// BLL -> DAL: one security event to record in audit_logs.
'use strict';

class AuditEntryDTO {
  constructor({ userId = null, action, entity = null, entityId = null, ip = null }) {
    this.userId = userId;
    this.action = action;
    this.entity = entity;
    this.entityId = entityId;
    this.ip = ip;
  }
}

module.exports = {
  AuditEntryDTO
};
