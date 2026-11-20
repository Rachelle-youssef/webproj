// Only these values may be saved as a browser session. No password or role is stored.
'use strict';
class SessionRecordDTO {
  constructor(data) {
    this.cookie = data.cookie;
    this.userId = data.userId;
    this.sessionVersion = data.sessionVersion;
    this.expiresAt = data.expiresAt;
  }
}

module.exports = { SessionRecordDTO };
