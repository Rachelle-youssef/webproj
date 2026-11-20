// BLL: keeps browser session IDs out of the database and delegates persistence.
'use strict';
const { createHash } = require('node:crypto');
const sessionsDAL = require('../DAL/sessions.dal');
const { SessionRecordDTO } = require('../DTO/session.dto');
const digest = (id) => createHash('sha256').update(id).digest('hex');
const find = (id) => sessionsDAL.find(digest(id));
const save = (id, data) => sessionsDAL.save(digest(id), new SessionRecordDTO(data));
const remove = (id) => sessionsDAL.remove(digest(id));
module.exports = { find, save, remove };
