// PL: request validation rules for blood requests, donations and stock.
'use strict';

const { body, param, query } = require('express-validator');
const { fields } = require('./users.validators');
const { listRules } = require('./common.validators');
const URGENCIES = ['normal', 'urgent', 'sos'];
const REQUEST_STATUSES = ['pending', 'open', 'fulfilled', 'cancelled'];
const DONATION_STATUSES = [
  'invited',
  'pending',
  'accepted',
  'completed',
  'declined',
  'cancelled'
];
const MOVEMENT_REASONS = ['donation', 'dispensed', 'adjustment'];
const id = () =>
  param('id')
    .isInt({
      min: 1
    })
    .withMessage('must be a positive whole number')
    .toInt();
const bloodType = () =>
  body('blood_type_id')
    .isInt({
      min: 1,
      max: 8
    })
    .withMessage('must be a blood type id from 1 to 8')
    .toInt();
const optionalNote = () =>
  body('note')
    .optional({
      values: 'null'
    })
    .trim()
    .isLength({
      max: 255
    })
    .withMessage('must be at most 255 characters');
const requiredNote = () =>
  body('note')
    .trim()
    .isLength({
      min: 3,
      max: 255
    })
    .withMessage('is required (3 to 255 characters)');
const createRequest = [
  bloodType(),
  body('units_needed')
    .isInt({
      min: 1,
      max: 50
    })
    .withMessage('must be a whole number from 1 to 50')
    .toInt(),
  body('urgency').optional().isIn(URGENCIES).withMessage('must be normal, urgent or sos'),
  body('hospital_name')
    .trim()
    .isLength({
      min: 2,
      max: 120
    })
    .withMessage('must be 2 to 120 characters'),
  body('city')
    .optional({
      values: 'falsy'
    })
    .trim()
    .isLength({
      min: 2,
      max: 60
    })
    .withMessage('must be 2 to 60 characters'),
  fields.latitude(),
  fields.longitude(),
  fields.coordinatesPair()
];
const listRequests = [
  query('status')
    .optional()
    .isIn(REQUEST_STATUSES)
    .withMessage(`must be one of: ${REQUEST_STATUSES.join(', ')}`),
  query('urgency')
    .optional()
    .isIn(URGENCIES)
    .withMessage('must be normal, urgent or sos'),
  query('blood_type_id')
    .optional()
    .isInt({
      min: 1,
      max: 8
    })
    .withMessage('must be a blood type id from 1 to 8')
    .toInt(),
  query('city').optional().trim().isLength({
    max: 60
  }),
  ...listRules(['created_at', 'urgency', 'units_needed'])
];
const review = [
  id(),
  body('decision').isIn(['approve', 'deny']).withMessage('must be approve or deny'),
  body('note')
    .if(body('decision').equals('deny'))
    .trim()
    .isLength({
      min: 3,
      max: 255
    })
    .withMessage('is required when denying (3 to 255 characters)'),
  optionalNote()
];
const cancelRequest = [id(), optionalNote()];
const matches = [
  id(),
  query('limit')
    .optional()
    .isInt({
      min: 1,
      max: 100
    })
    .withMessage('must be a whole number from 1 to 100')
    .toInt()
];
const dispense = [
  id(),
  bloodType(),
  body('units')
    .isInt({
      min: 1,
      max: 50
    })
    .withMessage('must be a whole number from 1 to 50')
    .toInt(),
  optionalNote()
];
const invite = [
  id(),
  body('donor_id')
    .isInt({
      min: 1
    })
    .withMessage('must be a positive whole number')
    .toInt()
];
const offer = [
  body('request_id')
    .optional({
      values: 'null'
    })
    .isInt({
      min: 1
    })
    .withMessage('must be a positive whole number')
    .toInt()
];
const respond = [
  id(),
  body('accept')
    .isBoolean({
      strict: true
    })
    .withMessage('must be true or false')
];
const cancelDonation = [id(), requiredNote()];
const listDonations = [
  query('status')
    .optional()
    .isIn(DONATION_STATUSES)
    .withMessage(`must be one of: ${DONATION_STATUSES.join(', ')}`),
  query('request_id')
    .optional()
    .isInt({
      min: 1
    })
    .withMessage('must be a positive whole number')
    .toInt(),
  ...listRules(['created_at'])
];
const adjustStock = [
  bloodType(),
  body('change_units')
    .isInt({
      min: -500,
      max: 500
    })
    .withMessage('must be a whole number from -500 to 500')
    .custom((value) => Number(value) !== 0)
    .withMessage('cannot be 0')
    .toInt(),
  requiredNote()
];
const listMovements = [
  query('blood_type_id')
    .optional()
    .isInt({
      min: 1,
      max: 8
    })
    .withMessage('must be a blood type id from 1 to 8')
    .toInt(),
  query('reason')
    .optional()
    .isIn(MOVEMENT_REASONS)
    .withMessage(`must be one of: ${MOVEMENT_REASONS.join(', ')}`),
  ...listRules(['created_at'])
];
const idOnly = [id()];
const updateLocation = [
  id(),
  body('latitude')
    .isFloat({
      min: -90,
      max: 90
    })
    .withMessage('is required')
    .toFloat(),
  body('longitude')
    .isFloat({
      min: -180,
      max: 180
    })
    .withMessage('is required')
    .toFloat()
];
module.exports = {
  createRequest,
  listRequests,
  review,
  cancelRequest,
  matches,
  dispense,
  invite,
  offer,
  respond,
  cancelDonation,
  listDonations,
  adjustStock,
  listMovements,
  idOnly,
  updateLocation
};
