'use strict';

const { body, param, query } = require('express-validator');
const { listRules } = require('./common.validators');
const idOnly = [
  param('id')
    .isInt({
      min: 1,
      max: 4294967295
    })
    .toInt()
];
const createMedicine = [
  body('medicine_name').isString().bail().trim().isLength({
    min: 2,
    max: 120
  }),
  body('quantity')
    .isInt({
      min: 1,
      max: 100000
    })
    .toInt(),
  body('note')
    .optional({
      values: 'null'
    })
    .isString()
    .bail()
    .trim()
    .isLength({
      max: 300
    })
];
const listCalls = [
  query('status').optional().isIn(['open', 'closed']),
  query('medicine_name').optional().isString().bail().trim().isLength({
    min: 1,
    max: 120
  }),
  ...listRules(['created_at', 'quantity'])
];
const listNotifications = [
  query('is_read').optional().isIn(['true', 'false']).toBoolean(),
  query('type')
    .optional()
    .isIn([
      'sos',
      'request',
      'invite',
      'response',
      'donation',
      'medicine',
      'thanks',
      'account'
    ]),
  ...listRules(['created_at'])
];
const listFeed = [
  query('kind').optional().isIn(['blood', 'medicine']),
  ...listRules(['at'])
];
const listMap = [
  query('blood_type_id')
    .optional()
    .isInt({
      min: 1,
      max: 8
    })
    .toInt(),
  query('urgency').optional().isIn(['normal', 'urgent', 'sos']),
  query('city').optional().trim().isLength({
    max: 60
  }),
  ...listRules(['created_at'])
];
const listAudit = [
  query('action').optional().isString().bail().isLength({
    min: 1,
    max: 60
  }),
  query('entity').optional().isString().bail().isLength({
    min: 1,
    max: 40
  }),
  query('user_id')
    .optional()
    .isInt({
      min: 1,
      max: 4294967295
    })
    .toInt(),
  ...listRules(['created_at'])
];
module.exports = {
  idOnly,
  createMedicine,
  listCalls,
  listNotifications,
  listFeed,
  listMap,
  listAudit
};
